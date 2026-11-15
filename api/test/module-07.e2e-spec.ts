import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { createHash } from 'node:crypto';
import { AppModule } from '../src/app.module.js';
import { WorkerModule } from '../src/worker.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AnalyticsService } from '../src/analytics/analytics.service.js';
import { AnalyticsProcessor } from '../src/analytics/analytics.processor.js';
import type { ClickEventJobData } from '../src/analytics/analytics.types.js';

describe('Module 7 Click Analytics & Async Queue (e2e)', () => {
  let app: INestApplication<App>;
  let workerApp: INestApplication;
  let prisma: PrismaService;
  let analyticsService: AnalyticsService;
  let analyticsProcessor: AnalyticsProcessor;
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

    const workerFixture: TestingModule = await Test.createTestingModule({
      imports: [WorkerModule],
    }).compile();
    workerApp = workerFixture.createNestApplication();
    await workerApp.init();
    analyticsProcessor = workerApp.get(AnalyticsProcessor);
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.clickEvent.deleteMany({
        where: { linkId: { in: createdIds } },
      });
      await prisma.link.deleteMany({ where: { id: { in: createdIds } } });
    }
    if (workerApp) {
      await workerApp.close();
    }
    await app.close();
  });

  it('confirms producer and worker are wired to analytics-queue and record-click job with all 6 fields', async () => {
    const token = await login('alice', 'alice-development-password');
    const created = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: `https://queue-wire-check.example.com/${Date.now()}` })
      .expect(201);
    const linkId = created.body.id as string;
    createdIds.push(linkId);

    const queueName = (analyticsService as any).analyticsQueue.name;
    expect(queueName).toBe('analytics-queue');

    const queueAddSpy = jest.spyOn((analyticsService as any).analyticsQueue, 'add');

    const result = await analyticsService.recordClick({
      linkId,
      userAgent: 'QueueVerificationAgent/1.0',
      referrer: 'https://verify.example.com',
      ipHash: 'test-ip-hash',
    });

    expect(queueAddSpy).toHaveBeenCalledWith(
      'record-click',
      expect.objectContaining({
        eventId: result.eventId,
        linkId,
        clickedAt: expect.any(String),
        userAgent: 'QueueVerificationAgent/1.0',
        referrer: 'https://verify.example.com',
        ipHash: 'test-ip-hash',
      }),
      expect.objectContaining({
        jobId: result.eventId,
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
      }),
    );

    queueAddSpy.mockRestore();
  });

  it('records click event asynchronously via queue with privacy-preserving ipHash', async () => {
    const token = await login('alice', 'alice-development-password');
    const targetUrl = `https://analytics-test.example.com/${Date.now()}`;

    const created = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: targetUrl })
      .expect(201);
    createdIds.push(created.body.id as string);

    const testUa = 'Custom-Module7-Agent/1.0';
    const testReferrer = 'https://search.example.com';
    const testIp = '198.51.100.42';
    const expectedIpHash = createHash('sha256').update(testIp).digest('hex');

    // Perform redirect request
    await request(app.getHttpServer())
      .get(`/r/${created.body.code as string}`)
      .set('User-Agent', testUa)
      .set('Referer', testReferrer)
      .set('X-Forwarded-For', testIp)
      .expect(302)
      .expect('Location', targetUrl);

    // Poll for async processing in database
    let clickEvent: any = null;
    for (let i = 0; i < 30; i += 1) {
      clickEvent = await prisma.clickEvent.findFirst({
        where: { linkId: created.body.id as string },
      });
      if (clickEvent) {
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    expect(clickEvent).not.toBeNull();
    expect(clickEvent.linkId).toBe(created.body.id);
    expect(clickEvent.eventId).toEqual(expect.any(String));
    expect(clickEvent.userAgent).toBe(testUa);
    expect(clickEvent.referrer).toBe(testReferrer);
    expect(clickEvent.ipHash).toBe(expectedIpHash);
    // Crucial privacy check: raw IP must never be stored
    expect(clickEvent.ipHash).not.toContain(testIp);
  });

  it('supports protected analytics endpoint with from and to date filtering', async () => {
    const aliceToken = await login('alice', 'alice-development-password');
    const bobToken = await login('bob', 'bob-development-password');
    const targetUrl = `https://filtering-test.example.com/${Date.now()}`;

    const created = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${aliceToken}`)
      .send({ long_url: targetUrl })
      .expect(201);
    const linkId = created.body.id as string;
    createdIds.push(linkId);

    // Insert 3 click events manually with distinct timestamps
    await prisma.clickEvent.createMany({
      data: [
        {
          linkId,
          eventId: `evt-2025-${Date.now()}-1`,
          clickedAt: new Date('2025-01-15T10:00:00Z'),
          userAgent: 'Agent 2025',
          referrer: '',
          ipHash: 'hash1',
        },
        {
          linkId,
          eventId: `evt-2026-${Date.now()}-2`,
          clickedAt: new Date('2026-06-15T12:00:00Z'),
          userAgent: 'Agent 2026',
          referrer: '',
          ipHash: 'hash2',
        },
        {
          linkId,
          eventId: `evt-2027-${Date.now()}-3`,
          clickedAt: new Date('2027-02-20T15:00:00Z'),
          userAgent: 'Agent 2027',
          referrer: '',
          ipHash: 'hash3',
        },
      ],
    });

    // 1. Unfiltered query
    const allRes = await request(app.getHttpServer())
      .get(`/links/${linkId}/analytics`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(allRes.body.total_clicks).toBe(3);
    expect(allRes.body.last_clicked_at).toBe('2027-02-20T15:00:00.000Z');

    // 2. Filtered by from and to matching only 2026 event
    const filteredRes = await request(app.getHttpServer())
      .get(`/links/${linkId}/analytics?from=2026-01-01&to=2026-12-31`)
      .set('Authorization', `Bearer ${aliceToken}`)
      .expect(200);
    expect(filteredRes.body.total_clicks).toBe(1);
    expect(filteredRes.body.events).toHaveLength(1);
    expect(filteredRes.body.events[0].user_agent).toBe('Agent 2026');

    // 3. Ownership isolation: non-owner bob receives 404
    await request(app.getHttpServer())
      .get(`/links/${linkId}/analytics`)
      .set('Authorization', `Bearer ${bobToken}`)
      .expect(404);
  });

  it('proves idempotency: replaying identical eventId does not create duplicates', async () => {
    const token = await login('alice', 'alice-development-password');
    const created = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: `https://idempotency-test.example.com/${Date.now()}` })
      .expect(201);
    const linkId = created.body.id as string;
    createdIds.push(linkId);

    const duplicateEventId = `idempotent-test-event-${Date.now()}`;
    const payload: ClickEventJobData = {
      eventId: duplicateEventId,
      linkId,
      clickedAt: new Date().toISOString(),
      userAgent: 'IdempotencyTester/1.0',
      referrer: 'https://test.example.com',
      ipHash: 'fixed-hash-value',
    };

    const mockJob = {
      name: 'record-click',
      data: payload,
    } as any;

    // Process job once
    await analyticsProcessor.process(mockJob);

    const firstCount = await prisma.clickEvent.count({
      where: { linkId, eventId: duplicateEventId },
    });
    expect(firstCount).toBe(1);

    // Replay exact same job payload a second time (simulating at-least-once delivery retry)
    await expect(analyticsProcessor.process(mockJob)).resolves.not.toThrow();

    // Verify still exactly 1 record exists (no duplicate)
    const secondCount = await prisma.clickEvent.count({
      where: { linkId, eventId: duplicateEventId },
    });
    expect(secondCount).toBe(1);

    const totalClicks = await prisma.clickEvent.count({ where: { linkId } });
    expect(totalClicks).toBe(1);
  });

  it('survives queue unavailability via durable database fallback without breaking redirects', async () => {
    const token = await login('alice', 'alice-development-password');
    const longUrl = `https://fallback-test.example.com/${Date.now()}`;
    const created = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: longUrl })
      .expect(201);
    const linkId = created.body.id as string;
    createdIds.push(linkId);

    // Mock analyticsQueue.add on the service to simulate a queue outage/timeout
    const queueAddSpy = jest
      .spyOn((analyticsService as any).analyticsQueue, 'add')
      .mockRejectedValueOnce(new Error('Redis connection timeout'));

    // Perform redirect - must succeed with 302 and must not crash or hang
    const response = await request(app.getHttpServer())
      .get(`/r/${created.body.code as string}`)
      .expect(302);
    expect(response.headers.location).toBe(longUrl);

    // Verify queue add was called and failed
    expect(queueAddSpy).toHaveBeenCalled();

    // Verify the durable fallback persisted the click event directly into PostgreSQL
    const savedEvent = await prisma.clickEvent.findFirst({
      where: { linkId },
    });
    expect(savedEvent).not.toBeNull();
    expect(savedEvent?.linkId).toBe(linkId);

    queueAddSpy.mockRestore();
  });

  it('purges click events older than retention window', async () => {
    const token = await login('alice', 'alice-development-password');
    const created = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: `https://purge-test.example.com/${Date.now()}` })
      .expect(201);
    const linkId = created.body.id as string;
    createdIds.push(linkId);

    // Create one old event (45 days ago) and one recent event (1 hour ago)
    const oldEventId = `old-evt-${Date.now()}`;
    const newEventId = `new-evt-${Date.now()}`;

    await prisma.clickEvent.createMany({
      data: [
        {
          linkId,
          eventId: oldEventId,
          clickedAt: new Date(Date.now() - 45 * 24 * 60 * 60 * 1000),
          userAgent: 'Old Browser',
          referrer: '',
          ipHash: 'old-hash',
        },
        {
          linkId,
          eventId: newEventId,
          clickedAt: new Date(Date.now() - 60 * 60 * 1000),
          userAgent: 'Recent Browser',
          referrer: '',
          ipHash: 'new-hash',
        },
      ],
    });

    // Run purge for retention_days = 30
    const purgedCount = await analyticsService.purgeExpiredEvents(30);
    expect(purgedCount).toBeGreaterThanOrEqual(1);

    // Verify old event was purged
    const oldFound = await prisma.clickEvent.findUnique({
      where: { eventId: oldEventId },
    });
    expect(oldFound).toBeNull();

    // Verify recent event was preserved
    const newFound = await prisma.clickEvent.findUnique({
      where: { eventId: newEventId },
    });
    expect(newFound).not.toBeNull();
  });
});
