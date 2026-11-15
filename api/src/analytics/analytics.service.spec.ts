import { AnalyticsService } from './analytics.service.js';
import { AnalyticsProcessor } from './analytics.processor.js';
import { ANALYTICS_QUEUE, CLICK_EVENT_JOB } from './analytics.constants.js';
import type { ClickEventJobData } from './analytics.types.js';

describe('AnalyticsService and AnalyticsProcessor (unit)', () => {
  let analyticsService: AnalyticsService;
  let analyticsProcessor: AnalyticsProcessor;
  let mockQueue: { name: string; add: jest.Mock; close: jest.Mock };
  let mockPrisma: { clickEvent: { create: jest.Mock; deleteMany: jest.Mock } };
  let mockConfig: { get: jest.Mock };

  beforeEach(() => {
    mockQueue = {
      name: ANALYTICS_QUEUE,
      add: jest.fn().mockResolvedValue({ id: 'job-1' }),
      close: jest.fn().mockResolvedValue(undefined),
    };

    mockPrisma = {
      clickEvent: {
        create: jest.fn().mockResolvedValue({ id: 'click-1' }),
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
    };

    mockConfig = {
      get: jest.fn().mockReturnValue('30'),
    };

    analyticsService = new AnalyticsService(
      mockQueue as any,
      mockPrisma as any,
      mockConfig as any,
    );

    analyticsProcessor = new AnalyticsProcessor(mockPrisma as any);
  });

  describe('Producer (AnalyticsService)', () => {
    it('uses correct queue name: analytics-queue', () => {
      expect(mockQueue.name).toBe('analytics-queue');
      expect(ANALYTICS_QUEUE).toBe('analytics-queue');
    });

    it('enqueues job with name record-click and all 6 required fields', async () => {
      const result = await analyticsService.recordClick({
        linkId: 'test-link-uuid',
        userAgent: 'TestBrowser/1.0',
        referrer: 'https://test-ref.example.com',
        ipHash: 'test-ip-hash-sha256',
      });

      expect(result.eventId).toBeDefined();
      expect(typeof result.eventId).toBe('string');

      expect(mockQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, jobData, jobOptions] = mockQueue.add.mock.calls[0];

      expect(jobName).toBe('record-click');
      expect(CLICK_EVENT_JOB).toBe('record-click');

      // Verify all 6 required fields
      expect(jobData).toEqual({
        eventId: result.eventId,
        linkId: 'test-link-uuid',
        clickedAt: expect.any(String),
        userAgent: 'TestBrowser/1.0',
        referrer: 'https://test-ref.example.com',
        ipHash: 'test-ip-hash-sha256',
      });

      // Verify retry policy and jobId matches eventId
      expect(jobOptions.jobId).toBe(result.eventId);
      expect(jobOptions.attempts).toBe(3);
      expect(jobOptions.backoff).toEqual({
        type: 'exponential',
        delay: 1000,
      });
    });

    it('executes durable database fallback when queue is unavailable', async () => {
      mockQueue.add.mockRejectedValueOnce(new Error('Redis connection refused'));

      const result = await analyticsService.recordClick({
        linkId: 'fallback-link-uuid',
        userAgent: 'FallbackBrowser/1.0',
        referrer: '',
        ipHash: 'fallback-hash',
      });

      expect(result.eventId).toBeDefined();
      expect(mockPrisma.clickEvent.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          eventId: result.eventId,
          linkId: 'fallback-link-uuid',
          userAgent: 'FallbackBrowser/1.0',
          referrer: '',
          ipHash: 'fallback-hash',
        }),
      });
    });
  });

  describe('Worker (AnalyticsProcessor)', () => {
    it('successfully processes record-click job', async () => {
      const jobData: ClickEventJobData = {
        eventId: 'evt-uuid-1',
        linkId: 'link-uuid-1',
        clickedAt: new Date().toISOString(),
        userAgent: 'WorkerAgent/1.0',
        referrer: 'https://ref.com',
        ipHash: 'hash-val',
      };

      const mockJob = {
        name: 'record-click',
        data: jobData,
      } as any;

      await analyticsProcessor.process(mockJob);

      expect(mockPrisma.clickEvent.create).toHaveBeenCalledWith({
        data: {
          eventId: 'evt-uuid-1',
          linkId: 'link-uuid-1',
          clickedAt: expect.any(Date),
          userAgent: 'WorkerAgent/1.0',
          referrer: 'https://ref.com',
          ipHash: 'hash-val',
        },
      });
    });

    it('handles Prisma P2002 duplicate eventId idempotently without throwing', async () => {
      const p2002Error = new Error('Unique constraint failed on event_id');
      (p2002Error as any).code = 'P2002';
      mockPrisma.clickEvent.create.mockRejectedValueOnce(p2002Error);

      const jobData: ClickEventJobData = {
        eventId: 'duplicate-evt-id',
        linkId: 'link-uuid-1',
        clickedAt: new Date().toISOString(),
        userAgent: 'RetryAgent/1.0',
        referrer: '',
        ipHash: 'hash',
      };

      const mockJob = {
        name: 'record-click',
        data: jobData,
      } as any;

      // Must resolve cleanly without throwing
      await expect(analyticsProcessor.process(mockJob)).resolves.not.toThrow();
    });

    it('re-throws unexpected database errors to trigger BullMQ retries', async () => {
      const dbError = new Error('Database connection lost');
      mockPrisma.clickEvent.create.mockRejectedValueOnce(dbError);

      const jobData: ClickEventJobData = {
        eventId: 'retry-evt-id',
        linkId: 'link-uuid-1',
        clickedAt: new Date().toISOString(),
        userAgent: 'Agent/1.0',
        referrer: '',
        ipHash: 'hash',
      };

      const mockJob = {
        name: 'record-click',
        data: jobData,
      } as any;

      await expect(analyticsProcessor.process(mockJob)).rejects.toThrow(
        'Database connection lost',
      );
    });
  });
});
