import { Controller, Get, Header } from '@nestjs/common';
import { MetricsService } from './metrics.service.js';

export const PROMETHEUS_CONTENT_TYPE =
  'text/plain; version=0.0.4; charset=utf-8';

@Controller()
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', PROMETHEUS_CONTENT_TYPE)
  getMetrics(): Promise<string> {
    return this.metrics.renderPrometheus();
  }
}
