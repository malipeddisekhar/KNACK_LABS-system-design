import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { UnrecoverableError, type Job } from 'bullmq';
import { PrismaService } from '../database/prisma.service.js';
import {
  ANALYTICS_QUEUE,
  CLICK_EVENT_JOB,
  PURGE_EXPIRED_JOB,
} from './analytics.constants.js';
import type { ClickEventJobData } from './analytics.types.js';
import { isTransientDatabaseError } from '../common/resilience.js';

@Processor(ANALYTICS_QUEUE)
@Injectable()
export class AnalyticsProcessor extends WorkerHost implements OnModuleDestroy {
  private readonly logger = new Logger('AnalyticsWorker');

  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.worker) {
        await this.worker.close();
      }
    } catch {
      // Ignore worker close error during teardown
    }
  }

  async process(job: Job<ClickEventJobData>): Promise<void> {
    if (job.name === CLICK_EVENT_JOB) {
      await this.processClickEvent(job.data);
      return;
    }

    if (job.name === PURGE_EXPIRED_JOB) {
      this.logger.log(`[AnalyticsWorker] Received retention purge job`);
      return;
    }

    this.logger.warn(`[AnalyticsWorker] Unknown job name: ${job.name}`);
  }

  private async processClickEvent(data: ClickEventJobData): Promise<void> {
    const { eventId, linkId, clickedAt, userAgent, referrer, ipHash } = data;

    try {
      await this.prisma.clickEvent.create({
        data: {
          eventId,
          linkId,
          clickedAt: new Date(clickedAt),
          userAgent: userAgent ?? '',
          referrer: referrer ?? '',
          ipHash,
        },
      });

      this.logger.log(
        `[AnalyticsWorker] Persisted click event: eventId=${eventId} linkId=${linkId}`,
      );
    } catch (error) {
      // Prisma P2002 indicates duplicate eventId (idempotent retry or replay).
      if (this.isPrismaError(error, 'P2002')) {
        this.logger.warn(
          `[AnalyticsWorker] Duplicate eventId ignored (idempotent): eventId=${eventId}`,
        );
        return; // Idempotent success: do not re-throw, job succeeds cleanly
      }

      // Prisma P2003 indicates the link was deleted before the background job processed.
      if (this.isPrismaError(error, 'P2003')) {
        this.logger.warn(
          `[AnalyticsWorker] Parent link was removed before click event was persisted: linkId=${linkId}`,
        );
        return;
      }

      this.logger.error(
        '[AnalyticsWorker] Failed to persist click event; details withheld.',
      );
      if (isTransientDatabaseError(error)) {
        throw new Error('Transient analytics persistence failure.');
      }
      throw new UnrecoverableError('Non-retryable analytics persistence failure.');
    }
  }

  private isPrismaError(error: unknown, code: string): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code: unknown }).code === code
    );
  }
}
