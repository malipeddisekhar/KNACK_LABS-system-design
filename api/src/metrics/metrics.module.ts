import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { CommonModule } from '../common/common.module.js';
import { HttpMetricsMiddleware } from './http-metrics.middleware.js';
import { MetricsController } from './metrics.controller.js';
import { MetricsService } from './metrics.service.js';

@Module({
  imports: [DatabaseModule, CommonModule],
  controllers: [MetricsController],
  providers: [MetricsService, HttpMetricsMiddleware],
  exports: [MetricsService, HttpMetricsMiddleware],
})
export class MetricsModule {}
