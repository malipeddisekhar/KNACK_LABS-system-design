import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
  applyDecorators,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { Prisma } from '../generated/prisma/client.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';

type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';
type TeamRequest = Request & { user?: Principal };
const TEAM_ROLES = 'teamRoles';
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const RequireTeamRoles = (...roles: TeamRole[]) =>
  applyDecorators(
    UseGuards(JwtAuthGuard, TeamRoleGuard),
    SetMetadata(TEAM_ROLES, roles),
  );

@Injectable()
export class TeamRoleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const roles = this.reflector.getAllAndOverride<TeamRole[]>(TEAM_ROLES, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles?.length) {
      throw new ForbiddenException('Required team role is not configured.');
    }
    const request = context.switchToHttp().getRequest<TeamRequest>();
    const teamParam = request.params.teamId ?? request.params.id;
    const teamId = Array.isArray(teamParam) ? teamParam[0] : teamParam;
    const principalId = request.user?.principalId;
    if (!principalId || !teamId || !UUID.test(teamId)) {
      throw new ForbiddenException('Team access denied.');
    }
    const rows = await this.prisma.$queryRaw<{ role: string }[]>(Prisma.sql`
      SELECT "role"::text AS "role" FROM "team_members"
      WHERE "team_id" = ${teamId}::uuid AND "user_id" = ${principalId} LIMIT 1
    `);
    if (!rows[0] || !roles.includes(rows[0].role as TeamRole)) {
      throw new ForbiddenException('Insufficient team role.');
    }
    return true;
  }
}
