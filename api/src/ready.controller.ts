import { Controller, Get, HttpStatus, Logger, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './database/prisma.service.js';
import { CacheService } from './cache/cache.service.js';

export interface ReadinessChecks {
  database: 'up' | 'down';
  redis: 'up' | 'down';
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  checks: ReadinessChecks;
}

@Controller('ready')
export class ReadyController {
  private readonly logger = new Logger('ReadyController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
  ) {}

  @Get()
  async getReadiness(
    @Res({ passthrough: true }) res: Response,
  ): Promise<ReadinessResponse> {
    const [databaseUp, redisUp] = await Promise.all([
      this.checkDatabase(),
      this.checkRedis(),
    ]);

    const isReady = databaseUp && redisUp;
    const checks: ReadinessChecks = {
      database: databaseUp ? 'up' : 'down',
      redis: redisUp ? 'up' : 'down',
    };

    if (!isReady) {
      res.status(HttpStatus.SERVICE_UNAVAILABLE);
      return {
        status: 'not_ready',
        checks,
      };
    }

    return {
      status: 'ready',
      checks,
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      const queryPromise = this.prisma.$queryRaw`SELECT 1;`;
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database check timeout')), 2000);
      });
      await Promise.race([queryPromise, timeoutPromise]);
      return true;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Readiness check: PostgreSQL check failed: ${msg}`);
      return false;
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      const pingPromise = this.cacheService.ping();
      const timeoutPromise = new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(false), 2000);
      });
      return await Promise.race([pingPromise, timeoutPromise]);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Readiness check: Redis check failed: ${msg}`);
      return false;
    }
  }
}
