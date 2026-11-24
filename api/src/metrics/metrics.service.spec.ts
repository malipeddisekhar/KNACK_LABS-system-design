import { MetricsService } from './metrics.service.js';
import type { PrismaService } from '../database/prisma.service.js';

describe('MetricsService', () => {
  it('renders bounded HTTP counters, histogram buckets, process metrics, and team gauge', async () => {
    const queryRaw = jest.fn().mockResolvedValue([{ count: 3n }]);
    const prisma = { $queryRaw: queryRaw };
    const metrics = new MetricsService(prisma as unknown as PrismaService);
    metrics.recordHttpRequest('GET', '/:shortCode', 302, 0.012);
    metrics.recordHttpRequest('GET', '/:shortCode', 302, 0.4);

    const text = await metrics.renderPrometheus();

    expect(text).toContain('http_requests_total{method="GET",path="/:shortCode",status="302"} 2');
    expect(text).toContain('http_request_duration_seconds_bucket{method="GET",path="/:shortCode",status="302",le="0.025"} 1');
    expect(text).toContain('http_request_duration_seconds_count{method="GET",path="/:shortCode",status="302"} 2');
    expect(text).toContain('app_teams_total 3');
    expect(text).toContain('app_teams_total_available 1');
    expect(text).toContain('process_resident_memory_bytes');
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it('omits an unavailable team count and exposes its unavailable gauge without leaking DB errors', async () => {
    const prisma = {
      $queryRaw: jest
        .fn()
        .mockRejectedValue(new Error('postgres://user:secret@db/app')),
    };
    const metrics = new MetricsService(prisma as unknown as PrismaService);

    const text = await metrics.renderPrometheus();

    expect(text).not.toMatch(/^app_teams_total \d+$/m);
    expect(text).toContain('app_teams_total_available 0');
    expect(text).not.toContain('secret');
  });

  it('caps the number of HTTP label series', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]) };
    const metrics = new MetricsService(prisma as unknown as PrismaService);
    for (let index = 0; index < 600; index += 1) {
      metrics.recordHttpRequest('GET', `/route-${index}`, 200, 0.01);
    }

    const text = await metrics.renderPrometheus();
    const counterSamples = text
      .split('\n')
      .filter((line) => line.startsWith('http_requests_total{'));
    expect(counterSamples).toHaveLength(500);
    expect(text).toContain('path="other"');
    expect(text).toContain('status="overflow"');
    expect(text).not.toContain('path="other",status="500"');
    expect(text).toContain('http_requests_overflow_total 101');
  });

  it('does not invent a 500 status for an invalid status input', async () => {
    const prisma = { $queryRaw: jest.fn().mockResolvedValue([{ count: 0n }]) };
    const metrics = new MetricsService(prisma as unknown as PrismaService);
    metrics.recordHttpRequest('GET', '/:shortCode', '500' as never, 0.01);

    const text = await metrics.renderPrometheus();

    expect(text).toContain('status="unknown"');
    expect(text).not.toContain('status="500"');
  });
});
