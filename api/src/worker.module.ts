import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { DatabaseModule } from './database/database.module.js';
import { ANALYTICS_QUEUE } from './analytics/analytics.constants.js';
import { AnalyticsProcessor } from './analytics/analytics.processor.js';
import { createBullConnectionConfig } from './common/bull-config.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    DatabaseModule,
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => createBullConnectionConfig(config),
    }),
    BullModule.registerQueue({
      name: ANALYTICS_QUEUE,
    }),
  ],
  providers: [AnalyticsProcessor],
  exports: [AnalyticsProcessor],
})
export class WorkerModule {}
