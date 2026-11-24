import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { TeamActivityFeedService, type TeamActivityEvent } from './team-activity-feed.service.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto.js';

type TeamRow = { id: string; name: string; createdAt: Date; updatedAt: Date };
type InvitationRow = {
  id: string;
  teamId: string;
  invitedEmail: string;
  role: string;
  status: string;
  expiresAt: Date;
  createdAt: Date;
};
type PendingInvitation = {
  id: string;
  teamId: string;
  status: string;
  role: string;
  recipientUserId: string | null;
};
type TeamCommentRow = { id: string; teamId: string; authorId: string; body: string; mentions: string[]; createdAt: Date };
type AuditLogRow = { id: string; teamId: string; actorId: string; action: string; targetType: string; targetId: string; outcome: string; metadata: unknown; createdAt: Date };
type ActivityEventRow = { teamId: string; sequence: bigint | string; type: string; actorId: string; payload: Record<string, unknown> | null; createdAt: Date | string };

@Injectable()
export class TeamsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly activityFeed: TeamActivityFeedService,
  ) {}

  async create(dto: CreateTeamDto, principalId: string): Promise<TeamRow> {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('Team name must not be empty.');
    const teamId = randomUUID();
    const now = new Date();

    const committed = await this.prisma.$transaction(async (tx) => {
      const [team] = await tx.$queryRaw<TeamRow[]>(Prisma.sql`
        INSERT INTO "teams" ("id", "name", "created_at", "updated_at")
        VALUES (${teamId}::uuid, ${name}, ${now}, ${now})
        RETURNING "id", "name", "created_at" AS "createdAt", "updated_at" AS "updatedAt"
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "team_members" ("id", "team_id", "user_id", "role", "created_at", "updated_at")
        VALUES (${randomUUID()}::uuid, ${teamId}::uuid, ${principalId}, 'OWNER', ${now}, ${now})
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "audit_logs" ("id", "team_id", "actor_id", "action", "target_type", "target_id", "outcome", "metadata", "created_at")
        VALUES (${randomUUID()}::uuid, ${teamId}::uuid, ${principalId}, 'TEAM_CREATED', 'TEAM', ${teamId}, 'SUCCESS', ${JSON.stringify({ name })}::jsonb, ${now})
      `);
      const event = await this.emitActivity(tx, teamId, principalId, 'TEAM_CREATED', 'TEAM', teamId, { name });
      return { team, event };
    });
    this.activityFeed.publish(committed.event);
    return committed.team;
  }

  async createInvitation(
    teamId: string,
    actorId: string,
    dto: CreateTeamInvitationDto,
  ) {
    const recipientUserId = dto.inviteeUserId?.trim();
    if (!recipientUserId) {
      throw new BadRequestException('inviteeUserId is required to bind this invitation to a recipient.');
    }
    const invitedEmail = dto.invitedEmail.trim().toLowerCase();
    const role = dto.role ?? 'MEMBER';
    const token = randomBytes(32).toString('base64url');
    const tokenHash = createHash('sha256').update(token).digest('hex');

    const committed = await this.prisma.$transaction(async (tx) => {
      {
        const members = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "team_members"
          WHERE "team_id" = ${teamId}::uuid AND "user_id" = ${recipientUserId}
          LIMIT 1
        `);
        if (members.length) throw new ConflictException('User is already a team member.');
      }
      const [invitation] = await tx.$queryRaw<InvitationRow[]>(Prisma.sql`
        INSERT INTO "team_invitations" ("id", "team_id", "invited_by_user_id", "invited_email", "recipient_user_id", "role", "token_hash", "status", "created_at", "updated_at")
        VALUES (${randomUUID()}::uuid, ${teamId}::uuid, ${actorId}, ${invitedEmail}, ${recipientUserId}, ${role}::"TeamRole", ${tokenHash}, 'PENDING', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("team_id", "invited_email") WHERE "status" = 'PENDING' DO NOTHING
        RETURNING "id", "team_id" AS "teamId", "invited_email" AS "invitedEmail", "role"::text AS "role", "status"::text AS "status", "expires_at" AS "expiresAt", "created_at" AS "createdAt"
      `);
      if (!invitation) throw new ConflictException('A pending invitation already exists.');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "audit_logs" ("id", "team_id", "actor_id", "action", "target_type", "target_id", "outcome", "metadata", "created_at")
        VALUES (${randomUUID()}::uuid, ${teamId}::uuid, ${actorId}, 'TEAM_INVITATION_CREATED', 'TEAM_INVITATION', ${invitation.id}, 'SUCCESS', ${JSON.stringify({ invitedEmail, role })}::jsonb, CURRENT_TIMESTAMP)
      `);
      const event = await this.emitActivity(tx, teamId, actorId, 'TEAM_INVITATION_CREATED', 'TEAM_INVITATION', invitation.id, { role });
      return { response: { ...invitation, token }, event };
    });
    this.activityFeed.publish(committed.event);
    return committed.response;
  }

  async revokeInvitation(teamId: string, invitationId: string, actorId: string) {
    const committed = await this.prisma.$transaction(async (tx) => {
      const [invitation] = await tx.$queryRaw<{ id: string; status: string }[]>(Prisma.sql`
        SELECT "id", "status"::text AS "status" FROM "team_invitations"
        WHERE "id" = ${invitationId}::uuid AND "team_id" = ${teamId}::uuid FOR UPDATE
      `);
      if (!invitation) throw new NotFoundException('Invitation not found.');
      if (invitation.status !== 'PENDING') {
        throw new ConflictException('Only pending invitations can be revoked.');
      }
      await tx.$executeRaw(Prisma.sql`
        UPDATE "team_invitations" SET "status" = 'REVOKED', "updated_at" = CURRENT_TIMESTAMP
        WHERE "id" = ${invitationId}::uuid AND "team_id" = ${teamId}::uuid
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "audit_logs" ("id", "team_id", "actor_id", "action", "target_type", "target_id", "outcome", "created_at")
        VALUES (${randomUUID()}::uuid, ${teamId}::uuid, ${actorId}, 'TEAM_INVITATION_REVOKED', 'TEAM_INVITATION', ${invitationId}, 'SUCCESS', CURRENT_TIMESTAMP)
      `);
      const event = await this.emitActivity(tx, teamId, actorId, 'TEAM_INVITATION_REVOKED', 'TEAM_INVITATION', invitationId);
      return { response: { id: invitationId, teamId, status: 'REVOKED' }, event };
    });
    this.activityFeed.publish(committed.event);
    return committed.response;
  }

  async acceptInvitation(token: string, principalId: string) {
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const result = await this.prisma.$transaction(async (tx) => {
      const [invitation] = await tx.$queryRaw<PendingInvitation[]>(Prisma.sql`
        SELECT "id", "team_id" AS "teamId", "status"::text AS "status",
          "role"::text AS "role", "recipient_user_id" AS "recipientUserId"
        FROM "team_invitations" WHERE "token_hash" = ${tokenHash} FOR UPDATE
      `);
      if (!invitation) return { kind: 'missing' as const };
      if (invitation.status !== 'PENDING') return { kind: 'conflict' as const };
      const expired = await tx.$executeRaw(Prisma.sql`
        UPDATE "team_invitations" SET "status" = 'EXPIRED', "updated_at" = clock_timestamp()
        WHERE "id" = ${invitation.id}::uuid AND "status" = 'PENDING'
          AND "expires_at" <= clock_timestamp()
      `);
      if (expired) {
        return {
          kind: !invitation.recipientUserId
            ? 'unbound' as const
            : invitation.recipientUserId === principalId ? 'expired' as const : 'forbidden' as const,
        };
      }
      // Principal has no email; bind acceptance only to the explicitly stored principal ID.
      if (!invitation.recipientUserId) return { kind: 'unbound' as const };
      if (invitation.recipientUserId !== principalId) {
        return { kind: 'forbidden' as const };
      }
      const accepted = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        UPDATE "team_invitations" SET "status" = 'ACCEPTED',
          "accepted_at" = clock_timestamp(), "accepted_by_user_id" = ${principalId},
          "updated_at" = clock_timestamp()
        WHERE "id" = ${invitation.id}::uuid AND "status" = 'PENDING'
          AND "expires_at" > clock_timestamp()
        RETURNING "id"
      `);
      if (!accepted.length) {
        const expired = await tx.$executeRaw(Prisma.sql`
          UPDATE "team_invitations" SET "status" = 'EXPIRED', "updated_at" = clock_timestamp()
          WHERE "id" = ${invitation.id}::uuid AND "status" = 'PENDING'
            AND "expires_at" <= clock_timestamp()
        `);
        return { kind: expired ? 'expired' as const : 'conflict' as const };
      }
      const member = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        INSERT INTO "team_members" ("id", "team_id", "user_id", "role", "created_at", "updated_at")
        VALUES (${randomUUID()}::uuid, ${invitation.teamId}::uuid, ${principalId}, ${invitation.role}::"TeamRole", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT ("team_id", "user_id") DO NOTHING RETURNING "id"
      `);
      if (!member.length) throw new ConflictException('User is already a team member.');
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "audit_logs" ("id", "team_id", "actor_id", "action", "target_type", "target_id", "outcome", "created_at")
        VALUES (${randomUUID()}::uuid, ${invitation.teamId}::uuid, ${principalId}, 'TEAM_INVITATION_ACCEPTED', 'TEAM_INVITATION', ${invitation.id}, 'SUCCESS', CURRENT_TIMESTAMP)
      `);
      const event = await this.emitActivity(tx, invitation.teamId, principalId, 'TEAM_INVITATION_ACCEPTED', 'TEAM_INVITATION', invitation.id, { role: invitation.role });
      return { kind: 'accepted' as const, id: invitation.id, teamId: invitation.teamId, role: invitation.role, event };
    });
    if (result.kind === 'missing') throw new NotFoundException('Invitation not found.');
    if (result.kind === 'unbound') throw new ForbiddenException('Invitation is not bound to a recipient principal.');
    if (result.kind === 'forbidden') throw new ForbiddenException('Invitation recipient does not match.');
    if (result.kind === 'expired') throw new GoneException('Invitation has expired.');
    if (result.kind === 'conflict') throw new ConflictException('Invitation is no longer pending.');
    if (result.kind !== 'accepted') throw new ConflictException('Invitation is no longer pending.');
    this.activityFeed.publish(result.event);
    const { event: _event, ...response } = result;
    return response;
  }

  async listActivity(teamId: string, afterSeq?: string) {
    const cursor = afterSeq ?? '0';
    if (!/^(0|[1-9]\d*)$/.test(cursor) || BigInt(cursor) > 9223372036854775807n) {
      throw new BadRequestException('afterSeq must be a non-negative integer.');
    }
    return this.prisma.$queryRaw(Prisma.sql`
      SELECT "id", "sequence"::text AS "sequence", "actor_id" AS "actorId", "type",
        "target_type" AS "targetType", "target_id" AS "targetId", "metadata", "created_at" AS "createdAt"
      FROM "activity_events" WHERE "team_id" = ${teamId}::uuid AND "sequence" > ${cursor}::bigint
      ORDER BY "sequence" ASC
    `);
  }

  async createComment(teamId: string, authorId: string, body: string): Promise<TeamCommentRow> {
    if (typeof body !== 'string' || !body.trim()) throw new BadRequestException('Comment body must not be empty.');
    // Mention syntax is @<principalId>; only exact current team-member IDs resolve.
    const candidates = [...new Set(
      [...body.matchAll(/(?<![\w@])@([A-Za-z0-9_-]+)/g)].map((match) => match[1]),
    )];
    const committed = await this.prisma.$transaction(async (tx) => {
      const author = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
        SELECT "id" FROM "team_members"
        WHERE "team_id" = ${teamId}::uuid AND "user_id" = ${authorId} LIMIT 1
      `);
      if (!author.length) throw new ForbiddenException('Team access denied.');
      const resolved = candidates.length
        ? await tx.$queryRaw<{ userId: string }[]>(Prisma.sql`
            SELECT "user_id" AS "userId" FROM "team_members"
            WHERE "team_id" = ${teamId}::uuid AND "user_id" IN (${Prisma.join(candidates)})
          `)
        : [];
      const mentions = resolved.map((row) => row.userId);
      const [comment] = await tx.$queryRaw<TeamCommentRow[]>(Prisma.sql`
        INSERT INTO "team_comments" ("id", "team_id", "author_id", "body", "mentions", "created_at")
        VALUES (${randomUUID()}::uuid, ${teamId}::uuid, ${authorId}, ${body.trim()}, ${JSON.stringify(mentions)}::jsonb, CURRENT_TIMESTAMP)
        RETURNING "id", "team_id" AS "teamId", "author_id" AS "authorId", "body", "mentions", "created_at" AS "createdAt"
      `);
      await tx.$executeRaw(Prisma.sql`
        INSERT INTO "audit_logs" ("id", "team_id", "actor_id", "action", "target_type", "target_id", "outcome", "metadata", "created_at")
        VALUES (${randomUUID()}::uuid, ${teamId}::uuid, ${authorId}, 'TEAM_COMMENT_CREATED', 'TEAM_COMMENT', ${comment.id}, 'SUCCESS', ${JSON.stringify({ mentionCount: mentions.length })}::jsonb, CURRENT_TIMESTAMP)
      `);
      const event = await this.emitActivity(
        tx, teamId, authorId, 'TEAM_COMMENT_CREATED', 'TEAM_COMMENT', comment.id,
        { mentionCount: mentions.length },
      );
      return { comment, event };
    });
    this.activityFeed.publish(committed.event);
    return committed.comment;
  }

  async listComments(teamId: string): Promise<TeamCommentRow[]> {
    return this.prisma.$queryRaw<TeamCommentRow[]>(Prisma.sql`
      SELECT "id", "team_id" AS "teamId", "author_id" AS "authorId", "body", "mentions", "created_at" AS "createdAt"
      FROM "team_comments" WHERE "team_id" = ${teamId}::uuid ORDER BY "created_at" ASC, "id" ASC
    `);
  }

  async listAuditLogs(teamId: string, action?: string, actorId?: string): Promise<AuditLogRow[]> {
    const actionFilter = action?.trim() || null;
    const actorFilter = actorId?.trim() || null;
    const rows = await this.prisma.$queryRaw<AuditLogRow[]>(Prisma.sql`
      SELECT "id", "team_id" AS "teamId", "actor_id" AS "actorId", "action",
        "target_type" AS "targetType", "target_id" AS "targetId", "outcome", "metadata",
        "created_at" AS "createdAt"
      FROM "audit_logs" WHERE "team_id" = ${teamId}::uuid
        AND (${actionFilter}::text IS NULL OR "action" = ${actionFilter}::text)
        AND (${actorFilter}::text IS NULL OR "actor_id" = ${actorFilter}::text)
      ORDER BY "created_at" DESC, "id" DESC
    `);
    return rows.map((row) => ({ ...row, metadata: this.redactAuditMetadata(row.metadata) }));
  }

  private redactAuditMetadata(value: unknown): unknown {
    if (Array.isArray(value)) return value.map((entry) => this.redactAuditMetadata(entry));
    if (value && typeof value === 'object') {
      return Object.fromEntries(Object.entries(value).filter(([key]) => !/(token|secret|password|authorization|credential|api[_-]?key)/i.test(key)).map(([key, entry]) => [key, this.redactAuditMetadata(entry)]));
    }
    return value;
  }

  private async emitActivity(
    tx: Prisma.TransactionClient, teamId: string, actorId: string,
    type: string, targetType: string, targetId: string, metadata: object = {},
  ): Promise<TeamActivityEvent> {
    const [row] = await tx.$queryRaw<{ sequence: bigint }[]>(Prisma.sql`
      UPDATE "teams" SET "activity_sequence" = "activity_sequence" + 1
      WHERE "id" = ${teamId}::uuid RETURNING "activity_sequence" AS "sequence"
    `);
    if (!row) throw new NotFoundException('Team not found.');
    const [event] = await tx.$queryRaw<ActivityEventRow[]>(Prisma.sql`
      INSERT INTO "activity_events" ("id", "team_id", "sequence", "actor_id", "type", "target_type", "target_id", "metadata", "created_at")
      VALUES (${randomUUID()}::uuid, ${teamId}::uuid, ${row.sequence}, ${actorId}, ${type}, ${targetType}, ${targetId}, ${JSON.stringify(metadata)}::jsonb, CURRENT_TIMESTAMP)
      RETURNING "team_id" AS "teamId", "sequence", "type", "actor_id" AS "actorId",
        "metadata" AS "payload", "created_at" AS "createdAt"
    `);
    if (!event) throw new NotFoundException('Activity event was not created.');
    return {
      teamId: event.teamId,
      sequence: String(event.sequence),
      type: event.type,
      actorId: event.actorId,
      payload: event.payload ?? {},
      createdAt: new Date(event.createdAt).toISOString(),
    };
  }
}
