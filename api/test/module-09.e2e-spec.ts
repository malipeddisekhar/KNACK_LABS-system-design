import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AnalyticsService } from '../src/analytics/analytics.service.js';

describe('Module 9 E2E Test Suite (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let analyticsService: AnalyticsService;
  const createdIds: string[] = [];

  async function login(username: string, password: string): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username, password })
      .expect(201);
    return response.body.access_token as string;
  }

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    analyticsService = app.get(AnalyticsService);

    // Explicit runtime check: verify active database connection is url_shortener_test
    const currentDbResult = await prisma.$queryRaw<
      Array<{ current_database: string }>
    >`SELECT current_database();`;
    if (currentDbResult[0]?.current_database !== 'url_shortener_test') {
      throw new Error(
        `[DATABASE SAFETY GUARD] Refusing to run tests: Expected database 'url_shortener_test', but connected to '${currentDbResult[0]?.current_database}'.`,
      );
    }
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.clickEvent.deleteMany({
        where: { linkId: { in: createdIds } },
      });
      await prisma.link.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  describe('1. Authenticated link creation', () => {
    it('creates a link via POST /links when authenticated and returns HTTP 201 with destination URL', async () => {
      const token = await login('alice', 'alice-development-password');
      const destinationUrl =
        'https://example.com/module-09/build/authenticated-link';

      const response = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({
          long_url: destinationUrl,
          tags: ['module-09', 'build'],
        })
        .expect(201);

      expect(response.body).toBeDefined();
      expect(response.body.id).toEqual(expect.any(String));
      expect(response.body.code).toEqual(expect.any(String));
      expect(response.body.long_url).toBe(destinationUrl);
      expect(response.body.short_url).toEqual(
        expect.stringMatching(new RegExp(`/${response.body.code}$`)),
      );
      expect(response.body.created_at).toEqual(expect.any(String));

      // Track link ID for deterministic cleanup
      createdIds.push(response.body.id as string);

      // Verify link is persisted in the test database
      const persistedLink = await prisma.link.findUnique({
        where: { id: response.body.id as string },
      });
      expect(persistedLink).not.toBeNull();
      expect(persistedLink?.longUrl).toBe(destinationUrl);
      expect(persistedLink?.principalId).toBe('principal-alice');
    });
  });

  describe('2. URL redirect', () => {
    it('redirects GET /r/:code to the destination URL with HTTP 302 and exact Location header', async () => {
      const token = await login('alice', 'alice-development-password');
      const destinationUrl =
        'https://example.com/module-09/build/redirect-destination';

      // 1. Create a test link and capture its short code
      const createResponse = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({
          long_url: destinationUrl,
          tags: ['module-09', 'redirect'],
        })
        .expect(201);

      const code = createResponse.body.code as string;
      const linkId = createResponse.body.id as string;
      expect(code).toBeDefined();
      expect(linkId).toBeDefined();
      createdIds.push(linkId);

      // Verify link exists in dedicated test database
      const persisted = await prisma.link.findUnique({
        where: { id: linkId },
      });
      expect(persisted).not.toBeNull();
      expect(persisted?.code).toBe(code);

      // 2. Request GET /r/:code using the existing redirect route
      // 3. Assert HTTP 302
      // 4. Assert the Location header exactly matches the original destination URL
      const redirectResponse = await request(app.getHttpServer())
        .get(`/r/${code}`)
        .expect(302);

      expect(redirectResponse.headers.location).toBe(destinationUrl);
    });
  });

  describe('3. Protected-route authentication', () => {
    it('rejects unauthenticated GET /links with HTTP 401 and returns no protected data', async () => {
      // 1. Send an unauthenticated GET request to /links
      // 2. Assert that the response status is HTTP 401 Unauthorized
      const response = await request(app.getHttpServer())
        .get('/links')
        .expect(401);

      // 3. Verify that no protected link data is returned
      expect(response.body).toBeDefined();
      expect(response.body.statusCode).toBe(401);
      expect(response.body.items).toBeUndefined();
      expect(response.body).not.toHaveProperty('items');
      expect(response.body).not.toHaveProperty('links');
      expect(response.body.message).toEqual(
        expect.stringMatching(/Bearer token is required|Unauthorized/i),
      );
    });
  });

  describe('4. Owner scoping (IDOR prevention)', () => {
    it("returns HTTP 404 when Bob attempts to access Alice's link via GET /links/:id", async () => {
      // 1. Authenticate as Alice and Bob using existing test fixtures
      const aliceToken = await login('alice', 'alice-development-password');
      const bobToken = await login('bob', 'bob-development-password');
      const destinationUrl =
        'https://example.com/module-09/build/alice-private-link';

      // 2. Alice creates a link and captures its ID
      const createResponse = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${aliceToken}`)
        .send({
          long_url: destinationUrl,
          tags: ['module-09', 'idor-check'],
        })
        .expect(201);

      const aliceLinkId = createResponse.body.id as string;
      expect(aliceLinkId).toBeDefined();
      createdIds.push(aliceLinkId);

      // Verify link exists in test database belonging to Alice
      const linkInDb = await prisma.link.findUnique({
        where: { id: aliceLinkId },
      });
      expect(linkInDb).not.toBeNull();
      expect(linkInDb?.principalId).toBe('principal-alice');

      // 3. Bob attempts to access Alice's link using GET /links/:id
      // 4. Assert the response is HTTP 404, following the Module 4 ownership decision
      const bobResponse = await request(app.getHttpServer())
        .get(`/links/${aliceLinkId}`)
        .set('Authorization', `Bearer ${bobToken}`)
        .expect(404);

      // 5. Verify Bob receives no information about Alice's link
      expect(bobResponse.body.statusCode).toBe(404);
      expect(bobResponse.body.message).toBe('Link not found.');
      expect(bobResponse.body.long_url).toBeUndefined();
      expect(bobResponse.body.code).toBeUndefined();
      expect(bobResponse.body.id).toBeUndefined();
      expect(bobResponse.body.short_url).toBeUndefined();
      expect(bobResponse.body).not.toHaveProperty('long_url');
      expect(bobResponse.body).not.toHaveProperty('code');
    });
  });

  describe('5. Click analytics retention enforcement', () => {
    it('enforces retention by purging expired click events and excluding them from analytics queries', async () => {
      const token = await login('alice', 'alice-development-password');
      const destinationUrl =
        'https://example.com/module-09/build/retention-enforcement';

      // 1. Create a test link
      const createResponse = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({
          long_url: destinationUrl,
          tags: ['module-09', 'retention'],
        })
        .expect(201);

      const linkId = createResponse.body.id as string;
      expect(linkId).toBeDefined();
      createdIds.push(linkId);

      // 2. Deterministically seed expired (> 30 days) and recent click events in url_shortener_test
      const expiredEventId = `expired-${Date.now()}`;
      const recentEventId = `recent-${Date.now()}`;
      const expiredDate = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000); // 45 days ago
      const recentDate = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago

      await prisma.clickEvent.createMany({
        data: [
          {
            linkId,
            eventId: expiredEventId,
            clickedAt: expiredDate,
            userAgent: 'Legacy-Crawler/1.0',
            referrer: 'https://archive.example.org',
            ipHash: 'hash-expired',
          },
          {
            linkId,
            eventId: recentEventId,
            clickedAt: recentDate,
            userAgent: 'Modern-Browser/120.0',
            referrer: 'https://search.example.org',
            ipHash: 'hash-recent',
          },
        ],
      });

      // 3. Verify analytics returns both events before purge
      const initialAnalytics = await request(app.getHttpServer())
        .get(`/links/${linkId}/analytics`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(initialAnalytics.body.total_clicks).toBe(2);

      // 4. Execute the existing retention purge mechanism (30-day retention window)
      const purgedCount = await analyticsService.purgeExpiredEvents(30);
      expect(purgedCount).toBeGreaterThanOrEqual(1);

      // 5. Verify the expired click event is no longer returned by the analytics endpoint
      const postPurgeAnalytics = await request(app.getHttpServer())
        .get(`/links/${linkId}/analytics`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(postPurgeAnalytics.body.total_clicks).toBe(1);
      const returnedEvents = postPurgeAnalytics.body.events as Array<{
        user_agent: string;
      }>;
      expect(returnedEvents).toHaveLength(1);
      expect(returnedEvents[0]?.user_agent).toBe('Modern-Browser/120.0');

      // 6. Direct database check: expired record was deleted, recent was preserved
      const expiredInDb = await prisma.clickEvent.findUnique({
        where: { eventId: expiredEventId },
      });
      expect(expiredInDb).toBeNull();

      const recentInDb = await prisma.clickEvent.findUnique({
        where: { eventId: recentEventId },
      });
      expect(recentInDb).not.toBeNull();
    });
  });

  describe('6. URL validation', () => {
    it('rejects documented bypass string http%3A%2F%2Fevil.example.com with HTTP 400 without storing it', async () => {
      const token = await login('alice', 'alice-development-password');
      const bypassUrl = 'http%3A%2F%2Fevil.example.com';

      // 1. Send authenticated POST /links with documented bypass URL
      // 2. Assert HTTP 400 Bad Request
      const response = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({
          long_url: bypassUrl,
          tags: ['module-09', 'validation-bypass'],
        })
        .expect(400);

      expect(response.body).toBeDefined();
      expect(response.body.statusCode).toBe(400);

      // 3. Verify that no link record was stored in url_shortener_test
      const stored = await prisma.link.findFirst({
        where: { longUrl: bypassUrl },
      });
      expect(stored).toBeNull();
    });
  });
});
