import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from '../database/database.module.js';
import { ANALYTICS_QUEUE } from './analytics.constants.js';
import { AnalyticsService } from './analytics.service.js';
import { CommonModule } from '../common/common.module.js';

@Module({
  imports: [
    CommonModule,
    DatabaseModule,
    BullModule.registerQueue({
      name: ANALYTICS_QUEUE,
    }),
  ],
  providers: [AnalyticsService],
  exports: [AnalyticsService, BullModule],
})
export class AnalyticsModule {}
