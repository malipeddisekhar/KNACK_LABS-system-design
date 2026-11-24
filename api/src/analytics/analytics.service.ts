import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service.js';
import {
  ANALYTICS_QUEUE,
  CLICK_EVENT_JOB,
  DEFAULT_RETENTION_DAYS,
} from './analytics.constants.js';
import type { ClickEventJobData } from './analytics.types.js';
import { AppLogger } from '../common/app-logger.service.js';
import {
  DependencyTimeoutError,
  retryTransient,
  withDependencyTimeout,
} from '../common/resilience.js';

const ENQUEUE_TIMEOUT_MS = 500;
const FALLBACK_WRITE_TIMEOUT_MS = 750;

@Injectable()
export class AnalyticsService implements OnModuleDestroy {
  private readonly logger = new Logger('AnalyticsService');

  constructor(
    @InjectQueue(ANALYTICS_QUEUE) private readonly analyticsQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Optional() private readonly appLogger?: AppLogger,
  ) {}

  async onModuleDestroy(): Promise<void> {
    try {
      await this.analyticsQueue.close();
    } catch {
      // Ignore queue close errors during teardown
    }
  }

  /**
   * Publishes a click event to the background queue for asynchronous processing.
   * If the queue is unavailable or times out, it executes a durable fallback by
   * directly writing the event to PostgreSQL, ensuring redirects never hang or fail.
   */
  async recordClick(params: {
    linkId: string;
    userAgent?: string;
    referrer?: string;
    ipHash: string;
    requestId?: string;
  }): Promise<{ eventId: string }> {
    const eventId = randomUUID();
    const clickedAt = new Date().toISOString();
    const jobData: ClickEventJobData = {
      eventId,
      linkId: params.linkId,
      clickedAt,
      userAgent: params.userAgent ?? '',
      referrer: params.referrer ?? '',
      ipHash: params.ipHash,
    };

    try {
      await withDependencyTimeout(
        () =>
          retryTransient(
            () =>
              this.analyticsQueue.add(CLICK_EVENT_JOB, jobData, {
                jobId: eventId,
                attempts: 3,
                backoff: { type: 'exponential', delay: 500, jitter: 0.5 },
                removeOnComplete: true,
                removeOnFail: false,
              }),
            {
              maxRetries: 1,
              initialDelayMs: 40,
              maxDelayMs: 100,
              onRetry: (attempt, delayMs, errorCode) =>
                this.appLogger?.logDependencyRetry({
                  dependency: 'redis',
                  operation: 'analytics_enqueue',
                  attempt,
                  delay_ms: delayMs,
                  error_code: errorCode,
                  request_id: params.requestId,
                }),
            },
          ),
        'redis',
        'analytics_enqueue',
        ENQUEUE_TIMEOUT_MS,
      );
      this.logger.log(
        `[Analytics] Enqueued click job: eventId=${eventId} linkId=${params.linkId}`,
      );
    } catch (error) {
      if (error instanceof DependencyTimeoutError) {
        this.appLogger?.logDependencyTimeout({
          dependency: error.dependency,
          operation: error.operation,
          timeout_ms: error.timeoutMs,
          request_id: params.requestId,
        });
      }
      this.logger.warn(
        '[Analytics] Queue unavailable; applying durable database fallback (details withheld).',
      );

      try {
        await withDependencyTimeout(
          () =>
            this.prisma.clickEvent.create({
              data: {
                eventId,
                linkId: params.linkId,
                clickedAt: new Date(clickedAt),
                userAgent: params.userAgent ?? '',
                referrer: params.referrer ?? '',
                ipHash: params.ipHash,
              },
            }),
          'postgres',
          'analytics_fallback_write',
          FALLBACK_WRITE_TIMEOUT_MS,
        );
        this.logger.log(
          `[Analytics] Durable fallback saved click event: eventId=${eventId}`,
        );
      } catch (error) {
        if (error instanceof DependencyTimeoutError) {
          this.appLogger?.logDependencyTimeout({
            dependency: error.dependency,
            operation: error.operation,
            timeout_ms: error.timeoutMs,
            request_id: params.requestId,
          });
        }
        this.logger.error(
          '[Analytics] Durable fallback database write failed; details withheld.',
        );
      }
    }

    return { eventId };
  }

  /**
   * Purges click event records older than the specified retention window (in days).
   * Defaults to RETENTION_DAYS environment variable or 30 days.
   */
  async purgeExpiredEvents(retentionDays?: number): Promise<number> {
    const configuredDays = this.configService.get<string>('RETENTION_DAYS');
    const days =
      retentionDays !== undefined
        ? retentionDays
        : configuredDays !== undefined && configuredDays !== ''
          ? Number(configuredDays)
          : DEFAULT_RETENTION_DAYS;

    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await this.prisma.clickEvent.deleteMany({
      where: {
        clickedAt: {
          lt: cutoff,
        },
      },
    });

    this.logger.log(
      `[Analytics] Purged ${result.count} click events older than ${cutoff.toISOString()} (retention: ${days} days)`,
    );
    return result.count;
  }
}
