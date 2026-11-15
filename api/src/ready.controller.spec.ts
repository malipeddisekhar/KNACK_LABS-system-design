import { Test, TestingModule } from '@nestjs/testing';
import { HttpStatus } from '@nestjs/common';
import { ReadyController, ReadinessResponse } from './ready.controller.js';
import { PrismaService } from './database/prisma.service.js';
import { CacheService } from './cache/cache.service.js';

describe('ReadyController (unit)', () => {
  let controller: ReadyController;
  let mockPrisma: { $queryRaw: jest.Mock };
  let mockCache: { ping: jest.Mock };
  let mockRes: { status: jest.Mock };

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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ReadyController],
      providers: [
        { provide: PrismaService, useValue: mockPrisma },
        { provide: CacheService, useValue: mockCache },
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

  it('returns HTTP 503 and not_ready when PostgreSQL check fails', async () => {
    mockPrisma.$queryRaw.mockRejectedValue(new Error('Connection lost to postgres://user:secret@db.internal:5432'));

    const result: ReadinessResponse = await controller.getReadiness(
      mockRes as any,
    );

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result).toEqual({
      status: 'not_ready',
      checks: {
        database: 'down',
        redis: 'up',
      },
    });

    // Verify secret / credential suppression
    const serialized = JSON.stringify(result);
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('postgres://');
  });

  it('returns HTTP 503 and not_ready when Redis ping returns false or fails', async () => {
    mockCache.ping.mockResolvedValue(false);

    const result: ReadinessResponse = await controller.getReadiness(
      mockRes as any,
    );

    expect(mockRes.status).toHaveBeenCalledWith(HttpStatus.SERVICE_UNAVAILABLE);
    expect(result).toEqual({
      status: 'not_ready',
      checks: {
        database: 'up',
        redis: 'down',
      },
    });
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
      checks: {
        database: 'down',
        redis: 'down',
      },
    });
  });
});
