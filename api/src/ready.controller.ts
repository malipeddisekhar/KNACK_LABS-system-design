import { Controller, Get, HttpStatus, Logger, Optional, Req, Res } from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from './database/prisma.service.js';
import { CacheService } from './cache/cache.service.js';
import { AppLogger } from './common/app-logger.service.js';
import { DependencyTimeoutError } from './common/resilience.js';

export interface ReadinessChecks {
  database: 'up' | 'down';
  redis: 'up' | 'down';
}

export interface ReadinessResponse {
  status: 'ready' | 'not_ready';
  checks: ReadinessChecks;
  message?: string;
}

const READINESS_TIMEOUT_MS = 2000;
const NOT_READY_MESSAGE = 'One or more required dependencies are unavailable.';

@Controller('ready')
export class ReadyController {
  private readonly logger = new Logger('ReadyController');

  constructor(
    private readonly prisma: PrismaService,
    private readonly cacheService: CacheService,
    @Optional() private readonly appLogger?: AppLogger,
  ) {}

  @Get()
  async getReadiness(
    @Res({ passthrough: true }) res: Response,
    @Req() request?: { requestId?: string },
  ): Promise<ReadinessResponse> {
    const [databaseUp, redisUp] = await Promise.all([
      this.checkDatabase(request?.requestId),
      this.checkRedis(request?.requestId),
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
        message: NOT_READY_MESSAGE,
      };
    }

    return {
      status: 'ready',
      checks,
    };
  }

  private async checkDatabase(requestId?: string): Promise<boolean> {
    try {
      await this.withTimeout(
        this.prisma.$queryRaw`SELECT 1;`,
        'postgres',
        'readiness_query',
      );
      return true;
    } catch (error) {
      this.logTimeout(error, 'postgres', 'readiness_query', requestId);
      this.logger.warn(
        'Readiness check: PostgreSQL check failed; details withheld.',
      );
      return false;
    }
  }

  private async checkRedis(requestId?: string): Promise<boolean> {
    try {
      const redisUp = await this.withTimeout(
        this.cacheService.ping(),
        'redis',
        'readiness_ping',
      );
      if (!redisUp) {
        this.logger.warn(
          'Readiness check: Redis unavailable or timed out; details withheld.',
        );
      }
      return redisUp;
    } catch (error) {
      this.logTimeout(error, 'redis', 'readiness_ping', requestId);
      this.logger.warn(
        'Readiness check: Redis check failed or timed out; details withheld.',
      );
      return false;
    }
  }

  private async withTimeout<T>(
    operation: Promise<T>,
    dependency: string,
    operationName: string,
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new DependencyTimeoutError(dependency, operationName, READINESS_TIMEOUT_MS)),
          READINESS_TIMEOUT_MS,
        );
      });
      return await Promise.race([operation, timeout]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private logTimeout(
    error: unknown,
    dependency: string,
    operation: string,
    requestId?: string,
  ): void {
    if (!(error instanceof DependencyTimeoutError)) return;
    this.appLogger?.logDependencyTimeout({
      dependency,
      operation,
      timeout_ms: error.timeoutMs,
      request_id: requestId,
    });
  }
}
