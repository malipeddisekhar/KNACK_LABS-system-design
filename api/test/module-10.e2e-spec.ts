import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { WorkerModule } from '../src/worker.module.js';
import { PrismaService } from '../src/database/prisma.service.js';
import { AnalyticsService } from '../src/analytics/analytics.service.js';
import { AnalyticsProcessor } from '../src/analytics/analytics.processor.js';
import { ANALYTICS_QUEUE } from '../src/analytics/analytics.constants.js';

describe('Module 10 Multi-Service Separation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);

    // Verify active database is url_shortener_test
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

  describe('1. API responsibility (AppModule)', () => {
    it('provides the analytics queue producer (AnalyticsService and Queue)', () => {
      const analyticsService = app.get(AnalyticsService);
      expect(analyticsService).toBeDefined();

      const queue = app.get<Queue>(getQueueToken(ANALYTICS_QUEUE));
      expect(queue).toBeDefined();
      expect(queue.name).toBe('analytics-queue');
    });

    it('does NOT register or start AnalyticsProcessor in the API module', () => {
      // In NestJS, requesting an unregistered provider throws an exception
      expect(() => app.get(AnalyticsProcessor)).toThrow();
    });

    it('continues to serve API routes and authenticated link creation', async () => {
      const loginRes = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ username: 'alice', password: 'alice-development-password' })
        .expect(201);

      const token = loginRes.body.access_token as string;
      const targetUrl = 'https://example.com/module-10/api-check';

      const createRes = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({ long_url: targetUrl, tags: ['module-10'] })
        .expect(201);

      expect(createRes.body.long_url).toBe(targetUrl);
      createdIds.push(createRes.body.id as string);
    });
  });

  describe('2. Worker responsibility (WorkerModule)', () => {
    let workerFixture: TestingModule;

    afterEach(async () => {
      if (workerFixture) {
        await workerFixture.close();
      }
    });

    it('registers and resolves AnalyticsProcessor in WorkerModule', async () => {
      workerFixture = await Test.createTestingModule({
        imports: [WorkerModule],
      }).compile();

      const processor = workerFixture.get(AnalyticsProcessor);
      expect(processor).toBeDefined();
      expect(processor).toBeInstanceOf(AnalyticsProcessor);
    });

    it('bootstraps without API-only environment variables (PORT, JWT_SECRET)', async () => {
      const originalPort = process.env.PORT;
      const originalJwt = process.env.JWT_SECRET;

      try {
        delete process.env.PORT;
        delete process.env.JWT_SECRET;

        workerFixture = await Test.createTestingModule({
          imports: [WorkerModule],
        }).compile();

        const processor = workerFixture.get(AnalyticsProcessor);
        expect(processor).toBeDefined();
      } finally {
        if (originalPort !== undefined) process.env.PORT = originalPort;
        if (originalJwt !== undefined) process.env.JWT_SECRET = originalJwt;
      }
    });

    it('processes click events and persists to database with idempotency', async () => {
      workerFixture = await Test.createTestingModule({
        imports: [WorkerModule],
      }).compile();

      const processor = workerFixture.get(AnalyticsProcessor);
      const eventId = `evt-mod10-${Date.now()}`;

      // Create a link in test db
      const link = await prisma.link.create({
        data: {
          code: `code-${Date.now()}`,
          longUrl: 'https://example.com/worker-process-test',
          principalId: 'principal-alice',
        },
      });
      createdIds.push(link.id);

      const jobData = {
        eventId,
        linkId: link.id,
        clickedAt: new Date().toISOString(),
        userAgent: 'WorkerTest/1.0',
        referrer: 'https://referrer.example.com',
        ipHash: 'hash-worker-test',
      };

      // 1. Process job via worker processor
      await processor.process({ name: 'record-click', data: jobData } as any);

      // Verify persisted in database
      const found = await prisma.clickEvent.findUnique({
        where: { eventId },
      });
      expect(found).not.toBeNull();
      expect(found?.linkId).toBe(link.id);
      expect(found?.userAgent).toBe('WorkerTest/1.0');

      // 2. Re-process exact same job to verify idempotency
      await expect(
        processor.process({ name: 'record-click', data: jobData } as any),
      ).resolves.not.toThrow();

      // Verify still only 1 event exists
      const count = await prisma.clickEvent.count({
        where: { eventId },
      });
      expect(count).toBe(1);
    });
  });

  describe('3. Production Runtime Reliability (Liveness, Readiness, and Configuration)', () => {
    it('GET /health returns HTTP 200 with lightweight ok status', async () => {
      const res = await request(app.getHttpServer()).get('/health').expect(200);
      expect(res.body).toEqual({ ok: true });
    });

    it('GET /ready returns HTTP 200 with database and redis checks when dependencies are healthy', async () => {
      const res = await request(app.getHttpServer()).get('/ready').expect(200);
      expect(res.body).toEqual({
        status: 'ready',
        checks: {
          database: 'up',
          redis: 'up',
        },
      });
      // Verify no secrets or credentials leaked
      const bodyStr = JSON.stringify(res.body);
      expect(bodyStr).not.toContain('password');
      expect(bodyStr).not.toContain('postgresql://');
      expect(bodyStr).not.toContain('redis://');
    });
  });
});
