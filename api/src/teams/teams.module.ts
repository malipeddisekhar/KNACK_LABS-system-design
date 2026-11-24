import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { TeamRoleGuard } from './team-role.guard.js';
import { TeamActivityFeedService } from './team-activity-feed.service.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [TeamsController],
  providers: [TeamsService, TeamRoleGuard, TeamActivityFeedService],
  exports: [TeamRoleGuard],
})
export class TeamsModule {}
