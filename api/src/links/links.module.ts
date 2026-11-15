import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { CacheModule } from '../cache/cache.module.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';
import { RedirectController } from '../redirect/redirect.controller.js';
import { FutureDateConstraint } from './dto/future-date.constraint.js';
import { SafeLongUrlConstraint } from './dto/safe-long-url.constraint.js';
import { LinksController } from './links.controller.js';
import { LinksService } from './links.service.js';

@Module({
  imports: [DatabaseModule, AuthModule, CacheModule, AnalyticsModule],
  controllers: [LinksController, RedirectController],
  providers: [LinksService, SafeLongUrlConstraint, FutureDateConstraint],
  exports: [LinksService],
})
export class LinksModule {}
