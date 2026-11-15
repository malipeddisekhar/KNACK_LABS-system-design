import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { RequestIdMiddleware } from '../src/request-id.middleware';
import { AppLogger } from '../src/common/app-logger.service';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { PrismaService } from '../src/database/prisma.service';

/**
 * Module 05 — Error Handling & Logging (e2e)
 *
 * Verifies:
 *  1. Every response carries X-Request-ID.
 *  2. Error responses use the standard envelope { error: { code, message, request_id } }.
 *  3. The request_id in the body matches X-Request-ID.
 *  4. 5xx responses do NOT expose stack traces or internal messages.
 *  5. 4xx validation errors surface human-readable messages, not stack traces.
 *  6. Successful responses are unaffected.
 *  7. Regression tests for database write error propagation and duplicate-code retry.
 */
describe('Module 05 — error envelope, logging and write error regression (e2e)', () => {
  let app: INestApplication<App>;
  let jwtService: JwtService;
  let prisma: PrismaService;
  let appLogger: AppLogger;
  const createdIds: string[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();

    // Mirror the global setup from main.ts so the filter and middleware are active.
    const requestIdMiddleware = new RequestIdMiddleware();
    app.use(requestIdMiddleware.use.bind(requestIdMiddleware));

    app.use((_req: { _startTime?: number }, _res: unknown, next: () => void) => {
      _req._startTime = Date.now();
      next();
    });

    appLogger = app.get(AppLogger);
    app.useGlobalFilters(new HttpExceptionFilter(appLogger));

    await app.init();
    jwtService = app.get(JwtService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await prisma.clickEvent.deleteMany({ where: { linkId: { in: createdIds } } });
      await prisma.link.deleteMany({ where: { id: { in: createdIds } } });
    }
    await app.close();
  });

  // ------------------------------------------------------------------ helpers
  async function getToken(): Promise<string> {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'alice', password: 'alice-development-password' })
      .expect(201);
    return res.body.access_token as string;
  }

  // --------------------------------------------------------- X-Request-ID present

  it('attaches a unique X-Request-ID to every response', async () => {
    const r1 = await request(app.getHttpServer()).get('/health');
    const r2 = await request(app.getHttpServer()).get('/health');

    expect(r1.headers['x-request-id']).toBeDefined();
    expect(r2.headers['x-request-id']).toBeDefined();
    expect(r1.headers['x-request-id']).not.toBe(r2.headers['x-request-id']);
    // UUIDs are 36 characters in 8-4-4-4-12 format.
    expect(r1.headers['x-request-id']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  // -------------------------------------------------- 4xx — validation envelope

  it('returns envelope with code/message/request_id for a 400 validation error', async () => {
    const token = await getToken();
    const res = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: 'not-a-url' })
      .expect(400);

    const rid = res.headers['x-request-id'] as string;
    expect(rid).toBeDefined();

    expect(res.body).toMatchObject({
      error: {
        code: 'BAD_REQUEST',
        message: expect.any(String),
        request_id: rid,
      },
    });

    // No stack trace in the response body.
    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toMatch(/at\s+\w+\s+\(.*:\d+:\d+\)/);
    expect(bodyText).not.toContain('stackTrace');
    expect(bodyText).not.toContain('stack');
  });

  it('returns envelope for a 401 Unauthorized', async () => {
    const res = await request(app.getHttpServer())
      .get('/links')
      .set('Authorization', 'Bearer invalid-token')
      .expect(401);

    const rid = res.headers['x-request-id'] as string;
    expect(rid).toBeDefined();
    expect(res.body).toMatchObject({
      error: {
        code: 'UNAUTHORIZED',
        message: expect.any(String),
        request_id: rid,
      },
    });
  });

  it('returns envelope for a 404 Not Found', async () => {
    const res = await request(app.getHttpServer())
      .get('/nonexistent-route')
      .expect(404);

    const rid = res.headers['x-request-id'] as string;
    expect(rid).toBeDefined();
    expect(res.body).toMatchObject({
      error: {
        code: 'NOT_FOUND',
        message: expect.any(String),
        request_id: rid,
      },
    });
  });

  it('request_id in body matches X-Request-ID header', async () => {
    const res = await request(app.getHttpServer())
      .get('/nonexistent-route')
      .expect(404);

    expect(res.body.error.request_id).toBe(res.headers['x-request-id']);
  });

  // -------------------------------------------------- successful responses unchanged

  it('does not break successful health response', async () => {
    const res = await request(app.getHttpServer()).get('/health').expect(200);
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['x-request-id']).toBeDefined();
  });

  it('does not break successful login response', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ username: 'alice', password: 'alice-development-password' })
      .expect(201);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.token_type).toBe('Bearer');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  // ------------------------------------------ sentinel secret not in response

  it('does not expose the sentinel secret value in a 401 body', async () => {
    const sentinel = 'DO_NOT_LOG_ME_123';
    const res = await request(app.getHttpServer())
      .get('/links')
      .set('Authorization', `Bearer ${sentinel}`)
      .expect(401);

    const bodyText = JSON.stringify(res.body);
    expect(bodyText).not.toContain(sentinel);
  });

  // ------------------------------------------- forged / expired JWT → envelope

  it('returns envelope for an expired JWT', async () => {
    const expired = await jwtService.signAsync(
      { sub: 'principal-alice', username: 'alice' },
      { expiresIn: '-1s' },
    );
    const res = await request(app.getHttpServer())
      .get('/links')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);

    const rid = res.headers['x-request-id'] as string;
    expect(res.body).toMatchObject({
      error: { code: 'UNAUTHORIZED', request_id: rid },
    });
  });

  // ------------------------------------------- FIX REGRESSION: Database write errors

  it('returns HTTP 201 for valid link creation when database write succeeds', async () => {
    const token = await getToken();
    const res = await request(app.getHttpServer())
      .post('/links')
      .set('Authorization', `Bearer ${token}`)
      .send({ long_url: `https://example.com/fix-verify-${Date.now()}` })
      .expect(201);

    expect(res.body).toMatchObject({
      id: expect.any(String),
      code: expect.any(String),
      short_url: expect.stringContaining('/r/'),
      long_url: expect.stringContaining('https://example.com/fix-verify-'),
      created_at: expect.any(String),
    });
    expect(res.body.id).not.toBe('00000000-0000-0000-0000-000000000000');
    createdIds.push(res.body.id as string);
  });

  it('returns safe HTTP 500 envelope and logs error securely when database write fails unexpectedly', async () => {
    const token = await getToken();
    const logSpy = jest.spyOn(appLogger, 'logError');

    // Simulate unexpected database error (e.g. disk failure, network outage)
    const dbError = new Error('Database connection unexpectedly closed during write');
    const createSpy = jest.spyOn(prisma.link, 'create').mockRejectedValueOnce(dbError);

    try {
      const res = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({ long_url: 'https://example.com/db-fail' })
        .expect(500);

      const rid = res.headers['x-request-id'] as string;
      expect(rid).toBeDefined();

      // 1. Envelope structure matches standard
      expect(res.body).toEqual({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred. Please try again later.',
          request_id: rid,
        },
      });

      // 2. Request ID in body matches header
      expect(res.body.error.request_id).toBe(rid);

      // 3. No fake link was returned
      expect(res.body.id).toBeUndefined();

      // 4. No internal stack trace or raw DB message leaked in response body
      const bodyText = JSON.stringify(res.body);
      expect(bodyText).not.toContain('Database connection unexpectedly closed');
      expect(bodyText).not.toContain('stack');
      expect(bodyText).not.toMatch(/at\s+\w+\s+\(.*:\d+:\d+\)/);

      // 5. Server logger captured the error securely with the request ID
      expect(logSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          request_id: rid,
          method: 'POST',
          route: '/links',
          status_code: 500,
          error_code: 'INTERNAL_SERVER_ERROR',
        }),
      );
    } finally {
      createSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('retries on P2002 duplicate short code and succeeds if next attempt works', async () => {
    const token = await getToken();

    let callCount = 0;
    const createSpy = jest.spyOn(prisma.link, 'create');

    createSpy.mockImplementation(async (args) => {
      callCount += 1;
      if (callCount === 1) {
        // First attempt collides with existing code
        const p2002 = new Error('Unique constraint failed on the fields: (`code`)');
        Object.assign(p2002, { code: 'P2002' });
        throw p2002;
      }
      createSpy.mockRestore();
      return prisma.link.create(args);
    });

    try {
      const res = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({ long_url: `https://example.com/p2002-retry-${Date.now()}` })
        .expect(201);

      expect(callCount).toBe(2);
      expect(res.body.id).toBeDefined();
      createdIds.push(res.body.id as string);
    } finally {
      createSpy.mockRestore();
    }
  });

  it('returns HTTP 503 Service Unavailable when all P2002 retry attempts are exhausted', async () => {
    const token = await getToken();

    const createSpy = jest.spyOn(prisma.link, 'create').mockImplementation(async () => {
      const p2002 = new Error('Unique constraint failed on the fields: (`code`)');
      Object.assign(p2002, { code: 'P2002' });
      throw p2002;
    });

    try {
      const res = await request(app.getHttpServer())
        .post('/links')
        .set('Authorization', `Bearer ${token}`)
        .send({ long_url: 'https://example.com/exhaust-p2002' })
        .expect(503);

      const rid = res.headers['x-request-id'] as string;
      expect(res.body).toEqual({
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Unable to allocate a short code right now.',
          request_id: rid,
        },
      });
    } finally {
      createSpy.mockRestore();
    }
  });
});
