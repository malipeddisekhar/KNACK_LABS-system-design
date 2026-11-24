import 'reflect-metadata';
import { HEADERS_METADATA } from '@nestjs/common/constants';
import { MetricsController, PROMETHEUS_CONTENT_TYPE } from './metrics.controller.js';
import type { MetricsService } from './metrics.service.js';

describe('MetricsController', () => {
  it('declares the Prometheus text content type and returns exposition text', async () => {
    const renderPrometheus = jest
      .fn()
      .mockResolvedValue('# TYPE http_requests_total counter\n');
    const metrics = {
      renderPrometheus,
    } as unknown as MetricsService;
    const controller = new MetricsController(metrics);
    const handler = Object.getOwnPropertyDescriptor(
      MetricsController.prototype,
      'getMetrics',
    )?.value;
    const headers = Reflect.getMetadata(
      HEADERS_METADATA,
      handler,
    ) as Array<{ name: string; value: string }>;

    expect(PROMETHEUS_CONTENT_TYPE).toBe(
      'text/plain; version=0.0.4; charset=utf-8',
    );
    expect(headers).toContainEqual({
      name: 'Content-Type',
      value: PROMETHEUS_CONTENT_TYPE,
    });
    await expect(controller.getMetrics()).resolves.toContain(
      '# TYPE http_requests_total counter',
    );
    expect(renderPrometheus).toHaveBeenCalledTimes(1);
  });
});
