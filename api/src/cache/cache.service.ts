import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

@Injectable()
export class CacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('CacheService');
  private redis: Redis | null = null;
  private readonly defaultTtl = 300; // 5 minutes default TTL

  constructor(private readonly configService: ConfigService) {}

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
        connectTimeout: 3000,
        retryStrategy: (times) => {
          if (times > 3) {
            return null; // Stop retrying after 3 attempts so operations do not hang
          }
          return Math.min(times * 200, 1000);
        },
      });

      this.redis.on('connect', () => {
        this.logger.log('Redis client connected.');
      });

      this.redis.on('error', (err) => {
        this.logger.warn(`Redis error: ${err.message}`);
      });

      this.redis.connect().catch((err) => {
        this.logger.warn(`Initial Redis connection failed: ${err.message}`);
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Failed to initialize Redis client: ${message}`);
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
  async getRedirectTarget(code: string): Promise<string | null> {
    if (!this.redis) {
      return null;
    }

    try {
      const url = await this.redis.get(`redirect:${code}`);
      if (url) {
        this.logger.log(`[Cache Hit] code=${code}`);
        return url;
      }
      this.logger.log(`[Cache Miss] code=${code}`);
      return null;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Cache get failed for code=${code}: ${message}`);
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Cache set failed for code=${code}: ${message}`);
    }
  }

  /**
   * Retrieves the cached link ID for analytics recording on cache hits.
   */
  async getRedirectLinkId(code: string): Promise<string | null> {
    if (!this.redis) {
      return null;
    }

    try {
      return await this.redis.get(`redirect_id:${code}`);
    } catch {
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
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Cache invalidate failed for code=${code}: ${message}`);
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
    } catch {
      return false;
    }
  }
}

