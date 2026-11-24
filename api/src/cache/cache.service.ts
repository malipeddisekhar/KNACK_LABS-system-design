import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { AppLogger } from '../common/app-logger.service.js';
import {
  CircuitBreaker,
  CircuitOpenError,
  DependencyTimeoutError,
} from '../common/resilience.js';

const REDIS_RECONNECT_RETRY_LIMIT = 3;
const REDIS_RECONNECT_MAX_DELAY_MS = 1000;

export function redisReconnectDelay(
  retryCount: number,
  random: () => number = Math.random,
): number | null {
  if (!Number.isInteger(retryCount) || retryCount < 1 || retryCount > REDIS_RECONNECT_RETRY_LIMIT) {
    return null;
  }
  const ceiling = Math.min(
    200 * 2 ** (retryCount - 1),
    REDIS_RECONNECT_MAX_DELAY_MS,
  );
  const sample = random();
  const boundedSample = Number.isFinite(sample)
    ? Math.min(Math.max(sample, 0), 0.9999999999)
    : 0.5;
  return Math.floor(boundedSample * ceiling);
}

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CacheService');
  private redis: Redis | null = null;
  private readonly defaultTtl = 300; // 5 minutes default TTL
  private readonly redirectReadBreaker: CircuitBreaker;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly appLogger?: AppLogger,
  ) {
    this.redirectReadBreaker = new CircuitBreaker({
      failureThreshold: 3,
      resetTimeoutMs: 5000,
      onStateChange: (from, to) =>
        this.appLogger?.logCircuitState({
          dependency: 'redis',
          operation: 'redirect_cache_read',
          from_state: from,
          to_state: to,
        }),
    });
  }

  onModuleInit(): void {
    const redisUrl = this.configService.get<string>('REDIS_URL')?.trim();
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL is not set. Caching is disabled (graceful DB fallback active).',
      );
      return;
    }

    try {
      this.redis = new Redis(redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
        connectTimeout: 1500,
        commandTimeout: 1000,
        retryStrategy: (times) => redisReconnectDelay(times),
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis client connected.');
      });

      this.redis.on('error', () => {
        this.logger.warn('Redis client error; details withheld.');
      });

      this.redis.connect().catch(() => {
        this.logger.warn('Initial Redis connection failed; details withheld.');
      });
    } catch {
      this.logger.warn('Failed to initialize Redis client; details withheld.');
      this.redis = null;
    }
  }

  async onModuleDestroy(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch {
        this.redis.disconnect();
      }
    }
  }

  /**
   * Retrieves the cached redirect target URL for a given short code.
   * Returns null on cache miss or if Redis is unreachable (graceful fallback).
   */
  async getRedirectTarget(code: string, requestId?: string): Promise<string | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const url = await this.redirectReadBreaker.execute(() =>
        this.redis!.get(`redirect:${code}`),
      );
      if (url) {
        this.logger.log(`[Cache Hit] code=${code}`);
        return url;
      }
      this.logger.log(`[Cache Miss] code=${code}`);
      return null;
    } catch (error) {
      this.logReadFallback('redirect_cache_get', error, requestId);
      return null;
    }
  }

  /**
   * Stores the redirect target URL in the cache with a TTL (in seconds).
   * Optionally caches the associated linkId for analytics click tracking.
   */
  async setRedirectTarget(
    code: string,
    url: string,
    ttlSeconds?: number,
    linkId?: string,
  ): Promise<void> {
    if (!this.redis) {
      return;
    }

    const ttl = ttlSeconds ?? this.defaultTtl;
    try {
      if (linkId) {
        const pipeline = this.redis.pipeline();
        pipeline.set(`redirect:${code}`, url, 'EX', ttl);
        pipeline.set(`redirect_id:${code}`, linkId, 'EX', ttl);
        await pipeline.exec();
      } else {
        await this.redis.set(`redirect:${code}`, url, 'EX', ttl);
      }
      this.logger.log(`[Cache Set] code=${code} ttl=${ttl}s`);
    } catch (error) {
      this.logReadFallback('redirect_cache_set', error);
      this.logger.warn('Cache set failed; details withheld.');
    }
  }

  /**
   * Retrieves the cached link ID for analytics recording on cache hits.
   */
  async getRedirectLinkId(code: string, requestId?: string): Promise<string | null> {
    if (!this.redis) {
      return null;
    }

    try {
      return await this.redirectReadBreaker.execute(() =>
        this.redis!.get(`redirect_id:${code}`),
      );
    } catch (error) {
      this.logReadFallback('redirect_id_get', error, requestId);
      return null;
    }
  }

  /**
   * Invalidates cached redirect targets for a given code upon update or delete.
   */
  async invalidateRedirectTarget(code: string): Promise<void> {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.del(`redirect:${code}`, `redirect_id:${code}`);
      this.logger.log(`[Cache Invalidate] code=${code}`);
    } catch (error) {
      this.logReadFallback('redirect_cache_invalidate', error);
      this.logger.warn('Cache invalidation failed; details withheld.');
    }
  }

  /**
   * Health ping for testing connectivity.
   */
  async ping(): Promise<boolean> {
    if (!this.redis) {
      return false;
    }
    try {
      const pong = await this.redis.ping();
      return pong === 'PONG';
    } catch (error) {
      this.logReadFallback('readiness_ping', error);
      return false;
    }
  }

  private logReadFallback(operation: string, error: unknown, requestId?: string): void {
    if (error instanceof CircuitOpenError) return;
    if (isRedisCommandTimeout(error) || error instanceof DependencyTimeoutError) {
      this.appLogger?.logDependencyTimeout({
        dependency: 'redis',
        operation,
        timeout_ms:
          error instanceof DependencyTimeoutError ? error.timeoutMs : 1000,
        request_id: requestId,
      });
      return;
    }
    this.appLogger?.warnDependencyFailure({
      dependency: 'redis',
      operation,
      request_id: requestId,
    });
  }
}

function isRedisCommandTimeout(error: unknown): boolean {
  return error instanceof Error && error.message === 'Command timed out';
}
