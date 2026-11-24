import {
  Body,
  BadRequestException,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Sse,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal } from '../auth/current-principal.decorator.js';
import type { Principal } from '../auth/auth.types.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto.js';
import { AcceptTeamInvitationDto } from './dto/accept-team-invitation.dto.js';
import { CreateTeamCommentDto } from './dto/create-team-comment.dto.js';
import { RequireTeamRoles } from './team-role.guard.js';
import { TeamsService } from './teams.service.js';
import { TeamActivityFeedService } from './team-activity-feed.service.js';
import type { MessageEvent } from '@nestjs/common';
import type { Observable } from 'rxjs';

@Controller('teams')
export class TeamsController {
  constructor(
    private readonly teamsService: TeamsService,
    private readonly activityFeed: TeamActivityFeedService,
  ) {}

  @Get(':id/activity')
  @RequireTeamRoles('OWNER', 'ADMIN', 'MEMBER')
  activity(
    @Param('id', new ParseUUIDPipe()) teamId: string,
    @Query('afterSeq') afterSeq?: string,
  ) {
    return this.teamsService.listActivity(teamId, afterSeq);
  }

  @Sse(':id/activity/stream')
  @RequireTeamRoles('OWNER', 'ADMIN', 'MEMBER')
  streamActivity(
    @Param('id', new ParseUUIDPipe()) teamId: string,
    @CurrentPrincipal() principal: Principal,
    @Query('afterSequence') afterSequence?: string,
    @Query('lastSequence') lastSequence?: string,
    @Headers('last-event-id') lastEventId?: string,
  ): Observable<MessageEvent> {
    const cursor = afterSequence ?? lastSequence ?? lastEventId ?? '0';
    if (!/^(0|[1-9]\d*)$/.test(cursor) || BigInt(cursor) > 9223372036854775807n) {
      throw new BadRequestException('afterSequence must be a non-negative integer.');
    }
    return this.activityFeed.stream(teamId, principal, cursor);
  }

  @Post(':id/activity/stream/:connectionId/pong')
  @RequireTeamRoles('OWNER', 'ADMIN', 'MEMBER')
  activityPong(
    @Param('id', new ParseUUIDPipe()) teamId: string,
    @Param('connectionId', new ParseUUIDPipe()) connectionId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    this.activityFeed.acknowledge(teamId, connectionId, principal.principalId);
    return { acknowledged: true };
  }

  @Post(':id/comments')
  @RequireTeamRoles('OWNER', 'ADMIN', 'MEMBER')
  createComment(
    @Param('id', new ParseUUIDPipe()) teamId: string,
    @Body() dto: CreateTeamCommentDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.teamsService.createComment(teamId, principal.principalId, dto.body);
  }

  @Get(':id/comments')
  @RequireTeamRoles('OWNER', 'ADMIN', 'MEMBER')
  listComments(@Param('id', new ParseUUIDPipe()) teamId: string) {
    return this.teamsService.listComments(teamId);
  }

  @Get(':id/audit-logs')
  @RequireTeamRoles('OWNER', 'ADMIN')
  auditLogs(
    @Param('id', new ParseUUIDPipe()) teamId: string,
    @Query('action') action?: string,
    @Query('actorId') actorId?: string,
  ) {
    return this.teamsService.listAuditLogs(teamId, action, actorId);
  }

  @Post()
  @UseGuards(JwtAuthGuard)
  create(@Body() dto: CreateTeamDto, @CurrentPrincipal() principal: Principal) {
    return this.teamsService.create(dto, principal.principalId);
  }

  @Post('invitations/accept')
  @UseGuards(JwtAuthGuard)
  acceptInvitation(
    @Body() dto: AcceptTeamInvitationDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.teamsService.acceptInvitation(dto.token, principal.principalId);
  }

  @Post(':id/invitations')
  @RequireTeamRoles('OWNER', 'ADMIN')
  createInvitation(
    @Param('id', new ParseUUIDPipe()) teamId: string,
    @Body() dto: CreateTeamInvitationDto,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.teamsService.createInvitation(teamId, principal.principalId, dto);
  }

  @Delete(':id/invitations/:invitationId')
  @RequireTeamRoles('OWNER', 'ADMIN')
  revokeInvitation(
    @Param('id', new ParseUUIDPipe()) teamId: string,
    @Param('invitationId', new ParseUUIDPipe()) invitationId: string,
    @CurrentPrincipal() principal: Principal,
  ) {
    return this.teamsService.revokeInvitation(
      teamId,
      invitationId,
      principal.principalId,
    );
  }
}
