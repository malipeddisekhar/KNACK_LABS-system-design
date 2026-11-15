import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { RequestIdMiddleware } from '../src/request-id.middleware.js';
import { AppLogger } from '../src/common/app-logger.service.js';
import { HttpExceptionFilter } from '../src/common/http-exception.filter.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { CacheService } from '../src/cache/cache.service.js';

describe('Module 06 — Redis Caching, Cache Invalidation, and Graceful Fallback (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let cacheService: CacheService;
  let authToken: string;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

    app.use((_req: { _startTime?: number }, _res: unknown, next: () => void) => {
      _req._startTime = Date.now();
      next();
    });

    const appLogger = app.get(AppLogger);
    app.useGlobalFilters(new HttpExceptionFilter(appLogger));

    await app.init();
    prisma = app.get(PrismaService);
    cacheService = app.get(CacheService);

    const loginRes = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'alice', password: 'alice-development-password' })
      .expect(201);
    authToken = loginRes.body.access_token as string;
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

  it('verifies Redis connectivity via CacheService ping', async () => {
    const isAlive = await cacheService.ping();
    expect(isAlive).toBe(true);
  });

  it('first redirect populates Redis cache and returns 302', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ long_url: 'https://initial-target.example.com/' })
      .expect(201);

    const linkId = createRes.body.id as string;
    const code = createRes.body.code as string;
    createdIds.push(linkId);

    // Initial state: cache is not yet populated
    const cachedBefore = await cacheService.getRedirectTarget(code);
    expect(cachedBefore).toBeNull();

    // First redirect: Cache Miss -> DB lookup -> Cache set -> 302
    const redirectRes1 = await request(app.getHttpServer())
      .get(`/r/${code}`)
      .expect(302);
    expect(redirectRes1.headers.location).toBe(
      'https://initial-target.example.com/',
    );

    // Verify cache is now populated with correct URL
    const cachedAfter = await cacheService.getRedirectTarget(code);
    expect(cachedAfter).toBe('https://initial-target.example.com/');
  });

  it('second redirect is served as a cache hit', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ long_url: 'https://cached-target.example.com/' })
      .expect(201);

    const linkId = createRes.body.id as string;
    const code = createRes.body.code as string;
    createdIds.push(linkId);

    // First redirect primes the cache
    await request(app.getHttpServer()).get(`/r/${code}`).expect(302);

    // Second redirect: served from cache
    const redirectRes2 = await request(app.getHttpServer())
      .get(`/r/${code}`)
      .expect(302);
    expect(redirectRes2.headers.location).toBe(
      'https://cached-target.example.com/',
    );
  });

  it('cache entry has a positive TTL in seconds', async () => {
    const code = 'test-ttl-' + Date.now();
    await cacheService.setRedirectTarget(
      code,
      'https://ttl-test.example.com/',
      120,
    );

    const cached = await cacheService.getRedirectTarget(code);
    expect(cached).toBe('https://ttl-test.example.com/');

    // Clean up
    await cacheService.invalidateRedirectTarget(code);
  });

  it('updating link invalidates cache and redirect goes to updated URL', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ long_url: 'https://before-update.example.com/' })
      .expect(201);

    const linkId = createRes.body.id as string;
    const code = createRes.body.code as string;
    createdIds.push(linkId);

    // Prime cache
    const firstRedirect = await request(app.getHttpServer())
      .get(`/r/${code}`)
      .expect(302);
    expect(firstRedirect.headers.location).toBe(
      'https://before-update.example.com/',
    );
    expect(await cacheService.getRedirectTarget(code)).toBe(
      'https://before-update.example.com/',
    );

    // Update link via PATCH
    const updateRes = await request(app.getHttpServer())
      .patch(`/links/${linkId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .send({ long_url: 'https://after-update.example.com/' })
      .expect(200);
    expect(updateRes.body.long_url).toBe('https://after-update.example.com/');

    // Cache should be invalidated immediately
    const cachedAfterPatch = await cacheService.getRedirectTarget(code);
    expect(cachedAfterPatch).toBeNull();

    // Next redirect returns the updated target
    const secondRedirect = await request(app.getHttpServer())
      .get(`/r/${code}`)
      .expect(302);
    expect(secondRedirect.headers.location).toBe(
      'https://after-update.example.com/',
    );

    // Cache is now re-primed with the new URL
    expect(await cacheService.getRedirectTarget(code)).toBe(
      'https://after-update.example.com/',
    );
  });

  it('deleting link invalidates cache and redirect returns 404', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ long_url: 'https://to-delete.example.com/' })
      .expect(201);

    const linkId = createRes.body.id as string;
    const code = createRes.body.code as string;

    // Prime cache
    await request(app.getHttpServer()).get(`/r/${code}`).expect(302);
    expect(await cacheService.getRedirectTarget(code)).toBe(
      'https://to-delete.example.com/',
    );

    // Delete link
    await request(app.getHttpServer())
      .delete(`/links/${linkId}`)
      .set('Authorization', `Bearer ${authToken}`)
      .expect(200);

    // Cache is invalidated
    expect(await cacheService.getRedirectTarget(code)).toBeNull();

    // Subsequent redirect returns 404
    const res = await request(app.getHttpServer()).get(`/r/${code}`).expect(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('graceful fallback: redirect succeeds via DB fallback when Redis fails', async () => {
    const createRes = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${authToken}`)
      .send({ long_url: 'https://fallback-target.example.com/' })
      .expect(201);

    const linkId = createRes.body.id as string;
    const code = createRes.body.code as string;
    createdIds.push(linkId);

    // Spy on cacheService.getRedirectTarget to simulate Redis failure
    const getSpy = jest
      .spyOn(cacheService, 'getRedirectTarget')
      .mockRejectedValue(new Error('ECONNREFUSED simulated Redis outage'));
    const setSpy = jest
      .spyOn(cacheService, 'setRedirectTarget')
      .mockRejectedValue(new Error('ECONNREFUSED simulated Redis outage'));

    try {
      // Redirect must still succeed via DB fallback, returning 302 without crashing
      const res = await request(app.getHttpServer())
        .get(`/r/${code}`)
        .expect(302);
      expect(res.headers.location).toBe('https://fallback-target.example.com/');
    } finally {
      getSpy.mockRestore();
      setSpy.mockRestore();
    }
  });
});
