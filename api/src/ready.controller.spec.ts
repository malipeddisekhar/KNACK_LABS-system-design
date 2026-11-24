import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus, Logger } from '@nestjs/common';
import { ReadyController, ReadinessResponse } from './ready.controller.js';
import { PrismaService } from './database/prisma.service.js';
import { CacheService } from './cache/cache.service.js';
import { AppLogger } from './common/app-logger.service.js';

describe('ReadyController (unit)', () => {
  let controller: ReadyController;
  let mockPrisma: { $queryRaw: jest.Mock };
  let mockCache: { ping: jest.Mock };
  let mockRes: { status: jest.Mock };
  let mockAppLogger: { logDependencyTimeout: jest.Mock };

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  beforeEach(async () => {
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
    };
    mockCache = {
      ping: jest.fn().mockResolvedValue(true),
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
    };
    mockAppLogger = { logDependencyTimeout: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReadyController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
        { provide: AppLogger, useValue: mockAppLogger },
      ],
    }).compile();

    controller = module.get<ReadyController>(ReadyController);
  });

  it('returns HTTP 200 and ready status when both database and redis are healthy', async () => {
    const result: ReadinessResponse = await controller.getReadiness(
      mockRes as any,
    );

    expect(mockRes.status).not.toHaveBeenCalled();
    expect(result).toEqual({
      status: 'ready',
      checks: {
        database: 'up',
        redis: 'up',
      },
    });
  });

  it('clears readiness timeout timers after both checks settle', async () => {
    jest.useFakeTimers();

    const result = await controller.getReadiness(mockRes as any);

    expect(result.status).toBe('ready');
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns HTTP 503 and not_ready when PostgreSQL check fails', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection lost to postgres://user:secret@db.internal:5432'));

    const result: ReadinessResponse = await controller.getReadiness(
      mockRes as any,
    );

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result).toEqual({
      status: 'not_ready',
      message: 'One or more required dependencies are unavailable.',
      checks: {
        database: 'down',
        redis: 'up',
      },
    });

    // Verify secret / credential suppression
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('postgres://');
    expect(warn).toHaveBeenCalledWith(
      'Readiness check: PostgreSQL check failed; details withheld.',
    );
  });

  it('returns sanitized 503 and clears the timer when the database probe times out', async () => {
    jest.useFakeTimers();
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    mockPrisma.$queryRaw.mockImplementation(() => new Promise(() => {}));

    const pendingReadiness = controller.getReadiness(mockRes as any, {
      requestId: 'req-ready-17',
    });
    await jest.advanceTimersByTimeAsync(2000);
    const result = await pendingReadiness;

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result).toEqual({
      status: 'not_ready',
      message: 'One or more required dependencies are unavailable.',
      checks: { database: 'down', redis: 'up' },
    });
    expect(warn).toHaveBeenCalledWith(
      'Readiness check: PostgreSQL check failed; details withheld.',
    );
    expect(mockAppLogger.logDependencyTimeout).toHaveBeenCalledWith({
      dependency: 'postgres',
      operation: 'readiness_query',
      timeout_ms: 2000,
      request_id: 'req-ready-17',
    });
    expect(JSON.stringify(result)).not.toMatch(/secret|postgres:\/\//i);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('returns HTTP 503 and not_ready when Redis ping returns false or fails', async () => {
    const warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => {});
    mockCache.ping.mockResolvedValue(false);

    const result: ReadinessResponse = await controller.getReadiness(
      mockRes as any,
    );

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result).toEqual({
      status: 'not_ready',
      message: 'One or more required dependencies are unavailable.',
      checks: {
        database: 'up',
        redis: 'down',
      },
    });
    expect(warn).toHaveBeenCalledWith(
      'Readiness check: Redis unavailable or timed out; details withheld.',
    );
  });

  it('returns HTTP 503 and not_ready when both database and redis are down', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('DB unreachable'));
    mockCache.ping.mockRejectedValue(new Error('Redis unreachable'));

    const result: ReadinessResponse = await controller.getReadiness(
      mockRes as any,
    );

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result).toEqual({
      status: 'not_ready',
      message: 'One or more required dependencies are unavailable.',
      checks: {
        database: 'down',
        redis: 'down',
      },
    });
  });
});
