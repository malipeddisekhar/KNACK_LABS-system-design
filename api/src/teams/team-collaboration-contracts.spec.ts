import { BadRequestException, ExecutionContext, ForbiddenException, ValidationPipe } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { AcceptTeamInvitationDto } from './dto/accept-team-invitation.dto.js';
import { CreateTeamCommentDto } from './dto/create-team-comment.dto.js';
import { CreateTeamInvitationDto } from './dto/create-team-invitation.dto.js';
import { CreateTeamDto } from './dto/create-team.dto.js';
import { TeamRoleGuard } from './team-role.guard.js';
import { TeamActivityFeedService, type TeamActivityEvent } from './team-activity-feed.service.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

let teamId: string;
let actor: Principal;

describe('Team collaboration parallel-batch contracts', () => {
  beforeEach(() => {
    teamId = randomUUID();
    actor = { principalId: `principal-${randomUUID()}`, username: 'author' };
  });

  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('validates comment bodies at the global HTTP pipe boundary and retains trimmed service checks', async () => {
    const pipe = new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true });
    const metadata = { type: 'body' as const, metatype: CreateTeamCommentDto };
    await expect(pipe.transform({ body: 'A valid comment' }, metadata)).resolves.toMatchObject({ body: 'A valid comment' });
    await expect(pipe.transform({ body: 5 }, metadata)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ body: 'x'.repeat(5001) }, metadata)).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ name: '   ' }, { type: 'body', metatype: CreateTeamDto }))
      .resolves.toMatchObject({ name: '   ' }); // Service trims and rejects blank names.
    await expect(pipe.transform({ token: '' }, { type: 'body', metatype: AcceptTeamInvitationDto }))
      .rejects.toBeInstanceOf(BadRequestException);
    for (const role of ['ADMIN', 'MEMBER']) {
      await expect(pipe.transform({ invitedEmail: 'member@example.test', inviteeUserId: 'principal-member', role }, {
        type: 'body', metatype: CreateTeamInvitationDto,
      })).resolves.toMatchObject({ role });
    }
    await expect(pipe.transform({ invitedEmail: 'member@example.test', inviteeUserId: 'principal-member', role: 'OWNER' }, {
      type: 'body', metatype: CreateTeamInvitationDto,
    })).rejects.toBeInstanceOf(BadRequestException);
    await expect(pipe.transform({ invitedEmail: 'member@example.test' }, {
      type: 'body', metatype: CreateTeamInvitationDto,
    })).rejects.toBeInstanceOf(BadRequestException);

    const transaction = jest.fn();
    const service = new TeamsService({ $transaction: transaction } as unknown as PrismaService, {} as TeamActivityFeedService);
    await expect(service.createComment(teamId, actor.principalId, '   ')).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();
  });

  it('creates comments and resolves only active team-member mentions', async () => {
    const comment = {
      id: 'comment-1', teamId, authorId: actor.principalId,
      body: 'Hello @principal-active @principal-outside',
      mentions: ['principal-active'], createdAt: new Date('2026-11-22T00:00:00.000Z'),
    };
    const event = {
      teamId, sequence: '1', type: 'TEAM_COMMENT_CREATED', actorId: actor.principalId,
      payload: { mentionCount: 1 }, createdAt: '2026-11-22T00:00:00.000Z',
    } satisfies TeamActivityEvent;
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{ id: 'author-membership' }])
      .mockResolvedValueOnce([{ userId: 'principal-active' }])
      .mockResolvedValueOnce([comment])
      .mockResolvedValueOnce([{ sequence: 1n }])
      .mockResolvedValueOnce([event]);
    let auditWritten = false;
    const executeRaw = jest.fn(async () => { auditWritten = true; return 1; });
    const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
    let committed = false;
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
        const result = await work(tx);
        committed = true;
        return result;
      }),
    };
    const feed = {
      publish: jest.fn((published: TeamActivityEvent) => {
        expect(committed).toBe(true);
        expect(auditWritten).toBe(true);
        expect(queryRaw).toHaveBeenCalledTimes(5);
        expect(published.type).toBe('TEAM_COMMENT_CREATED');
      }),
    } as unknown as TeamActivityFeedService;
    const service = new TeamsService(prisma as unknown as PrismaService, feed);

    await expect(service.createComment(teamId, actor.principalId, comment.body))
      .resolves.toMatchObject({ body: comment.body, mentions: ['principal-active'] });

    const auditSql = executeRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    const eventSql = queryRaw.mock.calls[4][0] as { sql: string; values: unknown[] };
    expect(auditSql.sql).toContain('INSERT INTO "audit_logs"');
    expect(auditSql.sql).toContain('TEAM_COMMENT_CREATED');
    expect(auditSql.sql).toContain("'TEAM_COMMENT'");
    expect(auditSql.sql).toContain("'SUCCESS'");
    expect(auditSql.values).toEqual(expect.arrayContaining([
      teamId, actor.principalId, comment.id, JSON.stringify({ mentionCount: 1 }),
    ]));
    expect(auditSql.values).not.toContain(comment.body);
    expect(eventSql.sql).toContain('INSERT INTO "activity_events"');
    expect(eventSql.values).toContain('TEAM_COMMENT_CREATED');
    const mentionLookup = queryRaw.mock.calls[1][0] as { sql: string; values: unknown[] };
    expect(mentionLookup.sql).toContain('"team_id" =');
    expect(mentionLookup.sql).toContain('"user_id" IN');
    expect(mentionLookup.values).toEqual(expect.arrayContaining([
      teamId, 'principal-active', 'principal-outside',
    ]));
    expect(feed.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'TEAM_COMMENT_CREATED', payload: { mentionCount: 1 },
    }));
  });

  it('records invitation audit and activity rows in one transaction before post-commit publish', async () => {
    const invitation = {
      id: 'invitation-1', teamId, invitedEmail: 'member@example.test', role: 'MEMBER',
      status: 'PENDING', expiresAt: new Date('2026-11-29T00:00:00.000Z'),
      createdAt: new Date('2026-11-22T00:00:00.000Z'),
    };
    const event = {
      teamId, sequence: 1n, type: 'TEAM_INVITATION_CREATED', actorId: actor.principalId,
      payload: { role: 'MEMBER' }, createdAt: new Date('2026-11-22T00:00:00.000Z'),
    };
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([invitation])
      .mockResolvedValueOnce([{ sequence: 1n }])
      .mockResolvedValueOnce([event]);
    let auditWritten = false;
    const executeRaw = jest.fn(async () => { auditWritten = true; return 1; });
    const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
    let committed = false;
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
        const result = await work(tx);
        committed = true;
        return result;
      }),
    };
    const feed = {
      publish: jest.fn((published: TeamActivityEvent) => {
        expect(committed).toBe(true);
        expect(auditWritten).toBe(true);
        expect(queryRaw).toHaveBeenCalledTimes(4);
        expect(published.type).toBe('TEAM_INVITATION_CREATED');
      }),
    } as unknown as TeamActivityFeedService;
    const service = new TeamsService(prisma as unknown as PrismaService, feed);

    await service.createInvitation(teamId, actor.principalId, {
      invitedEmail: 'Member@Example.Test', inviteeUserId: 'principal-member',
    });

    const auditSql = executeRaw.mock.calls[0][0] as { sql: string };
    const eventSql = queryRaw.mock.calls[3][0] as { sql: string; values: unknown[] };
    expect(auditSql.sql).toContain('TEAM_INVITATION_CREATED');
    expect(eventSql.sql).toContain('INSERT INTO "activity_events"');
    expect(eventSql.values).toContain('TEAM_INVITATION_CREATED');
    expect(feed.publish).toHaveBeenCalledTimes(1);
  });

  it('requires a recipient principal at invitation creation and rejects legacy unbound or mismatched acceptance', async () => {
    const transaction = jest.fn();
    const feed = { publish: jest.fn() } as unknown as TeamActivityFeedService;
    const service = new TeamsService({ $transaction: transaction } as unknown as PrismaService, feed);
    await expect(service.createInvitation(teamId, actor.principalId, {
      invitedEmail: 'member@example.test', inviteeUserId: '',
    } as CreateTeamInvitationDto)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();

    for (const recipientUserId of [null, 'principal-someone-else']) {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{
          id: 'invitation-1', teamId, status: 'PENDING', role: 'MEMBER', recipientUserId,
        }]),
        $executeRaw: jest.fn().mockResolvedValue(0),
      };
      const prisma = { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) };
      const acceptingService = new TeamsService(prisma as unknown as PrismaService, feed);
      await expect(acceptingService.acceptInvitation('one-time-token', actor.principalId))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    }
  });

  it('preserves single-use acceptance for the explicitly bound recipient', async () => {
    const event = {
      teamId, sequence: 1n, type: 'TEAM_INVITATION_ACCEPTED', actorId: actor.principalId,
      payload: { role: 'MEMBER' }, createdAt: new Date('2026-11-22T00:00:00.000Z'),
    };
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{
          id: 'invitation-bound', teamId, status: 'PENDING', role: 'MEMBER', recipientUserId: actor.principalId,
        }])
        .mockResolvedValueOnce([{ id: 'invitation-bound' }])
        .mockResolvedValueOnce([{ id: 'membership-1' }])
        .mockResolvedValueOnce([{ sequence: 1n }])
        .mockResolvedValueOnce([event]),
      $executeRaw: jest.fn().mockResolvedValue(0),
    };
    const prisma = { $transaction: (work: (client: typeof tx) => Promise<unknown>) => work(tx) };
    const feed = { publish: jest.fn() } as unknown as TeamActivityFeedService;
    const service = new TeamsService(prisma as unknown as PrismaService, feed);

    await expect(service.acceptInvitation('single-use-token', actor.principalId))
      .resolves.toMatchObject({ id: 'invitation-bound', teamId, role: 'MEMBER' });
    expect(tx.$queryRaw).toHaveBeenCalledTimes(5);
    expect(feed.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'TEAM_INVITATION_ACCEPTED' }));
  });

  it('rejects non-members and members whose live role is insufficient', async () => {
    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['OWNER', 'ADMIN']) };
    const queryRaw = jest.fn()
      .mockResolvedValueOnce([{ role: 'MEMBER' }])
      .mockResolvedValueOnce([]);
    const guard = new TeamRoleGuard(reflector as never, { $queryRaw: queryRaw } as unknown as PrismaService);
    const context = {
      getHandler: () => ({}), getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ params: { id: teamId }, user: actor }) }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);

    const roleQuery = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(roleQuery.values).toEqual(expect.arrayContaining([teamId, actor.principalId]));
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it('creates a team with owner, audit, and activity writes before returning through the controller', async () => {
    const team = { id: teamId, name: 'Design', createdAt: new Date(), updatedAt: new Date() };
    const event = {
      teamId, sequence: '1', type: 'TEAM_CREATED', actorId: actor.principalId,
      payload: { name: 'Design' }, createdAt: new Date().toISOString(),
    } satisfies TeamActivityEvent;
    let committed = false;
    const queryRaw = jest.fn().mockResolvedValueOnce([team]).mockResolvedValueOnce([{ sequence: 1n }])
      .mockResolvedValueOnce([event]);
    const executeRaw = jest.fn().mockResolvedValue(1);
    const tx = { $queryRaw: queryRaw, $executeRaw: executeRaw };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
      const result = await work(tx); committed = true; return result;
    }) };
    const feed = { publish: jest.fn(() => expect(committed).toBe(true)) } as unknown as TeamActivityFeedService;
    const service = new TeamsService(prisma as unknown as PrismaService, feed);
    const controller = new TeamsController(service, feed);

    await expect(controller.create({ name: ' Design ' }, actor)).resolves.toMatchObject({ id: teamId, name: 'Design' });
    expect(executeRaw).toHaveBeenCalledTimes(2);
    expect((executeRaw.mock.calls[0][0] as { sql: string }).sql).toContain("'OWNER'");
    expect((executeRaw.mock.calls[1][0] as { sql: string }).sql).toContain('INSERT INTO "audit_logs"');
    expect(feed.publish).toHaveBeenCalledWith(expect.objectContaining({ type: 'TEAM_CREATED', teamId }));
  });

  it('keeps team creation whitespace rejection and audit retrieval scoped to privileged roles', async () => {
    const transaction = jest.fn();
    const feed = { publish: jest.fn() } as unknown as TeamActivityFeedService;
    const service = new TeamsService({ $transaction: transaction } as unknown as PrismaService, feed);
    await expect(service.create({ name: '  ' }, actor.principalId)).rejects.toBeInstanceOf(BadRequestException);
    expect(transaction).not.toHaveBeenCalled();

    const logs = [{ id: 'audit-1', teamId, actorId: actor.principalId, action: 'TEAM_CREATED', targetType: 'TEAM', targetId: teamId, outcome: 'SUCCESS', metadata: {}, createdAt: new Date() }];
    const queryRaw = jest.fn().mockResolvedValue(logs);
    const auditService = new TeamsService({ $queryRaw: queryRaw } as unknown as PrismaService, feed);
    const controller = new TeamsController(auditService, feed);
    await expect(controller.auditLogs(teamId, 'TEAM_CREATED', actor.principalId)).resolves.toEqual(logs);
    expect((queryRaw.mock.calls[0][0] as { values: unknown[] }).values).toEqual(expect.arrayContaining([teamId, 'TEAM_CREATED', actor.principalId]));
    expect(Reflect.getMetadata('teamRoles', TeamsController.prototype.auditLogs)).toEqual(['OWNER', 'ADMIN']);
  });

  it('keeps live guard authorization scoped to the requested team for OWNER and ADMIN only', async () => {
    for (const role of ['OWNER', 'ADMIN']) {
      const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['OWNER', 'ADMIN']) };
      const queryRaw = jest.fn().mockResolvedValue([{ role }]);
      const guard = new TeamRoleGuard(reflector as never, { $queryRaw: queryRaw } as unknown as PrismaService);
      const context = { getHandler: () => ({}), getClass: () => ({}), switchToHttp: () => ({
        getRequest: () => ({ params: { id: teamId }, user: actor }),
      }) } as unknown as ExecutionContext;
      await expect(guard.canActivate(context)).resolves.toBe(true);
      expect((queryRaw.mock.calls[0][0] as { values: unknown[] }).values).toEqual(expect.arrayContaining([teamId, actor.principalId]));
    }
  });

  it('rejects cross-team comment writes and validates the REST activity cursor before querying', async () => {
    const otherTeamId = randomUUID();
    const commentQuery = jest.fn().mockResolvedValue([]);
    const tx = { $queryRaw: commentQuery, $executeRaw: jest.fn() };
    const prisma = {
      $transaction: jest.fn((work: (client: typeof tx) => Promise<unknown>) => work(tx)),
      $queryRaw: jest.fn().mockResolvedValue([]),
    };
    const feed = { publish: jest.fn() } as unknown as TeamActivityFeedService;
    const service = new TeamsService(prisma as unknown as PrismaService, feed);
    await expect(service.createComment(otherTeamId, actor.principalId, 'cross-team'))
      .rejects.toBeInstanceOf(ForbiddenException);
    expect((commentQuery.mock.calls[0][0] as { values: unknown[] }).values)
      .toEqual(expect.arrayContaining([otherTeamId, actor.principalId]));
    expect(commentQuery).toHaveBeenCalledTimes(1);
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(feed.publish).not.toHaveBeenCalled();

    await expect(service.listActivity(teamId, '12')).resolves.toEqual([]);
    const cursorQuery = (prisma.$queryRaw as jest.Mock).mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(cursorQuery.sql).toContain('"sequence" >');
    expect(cursorQuery.sql).toContain('ORDER BY "sequence" ASC');
    expect(cursorQuery.values).toEqual(expect.arrayContaining([teamId, '12']));
    for (const invalid of ['-1', '01', '9223372036854775808']) {
      await expect(service.listActivity(teamId, invalid)).rejects.toBeInstanceOf(BadRequestException);
    }
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('threads team, invitation, acceptance, comment mention, feed publication, and audit rows transactionally', async () => {
    const createdTeam = { id: teamId, name: 'Design', createdAt: new Date(), updatedAt: new Date() };
    const invitation = { id: 'invitation-flow', teamId, invitedEmail: 'member@example.test', role: 'MEMBER', status: 'PENDING', expiresAt: new Date('2026-11-29T00:00:00Z'), createdAt: new Date() };
    const comment = { id: 'comment-flow', teamId, authorId: 'principal-member', body: 'Welcome @principal-author', mentions: [actor.principalId], createdAt: new Date() };
    const event = (sequence: bigint, type: string, targetId: string, actorId = actor.principalId): TeamActivityEvent => ({
      teamId, sequence: String(sequence), type, actorId,
      payload: { targetId }, createdAt: '2026-11-22T00:00:00.000Z',
    });
    const queryRows = [
      [{ sequence: 1n }], [{ ...event(1n, 'TEAM_CREATED', teamId), sequence: 1n, createdAt: new Date() }],
      [], [invitation], [{ sequence: 2n }], [{ ...event(2n, 'TEAM_INVITATION_CREATED', invitation.id), sequence: 2n, createdAt: new Date() }],
      [{ id: invitation.id, teamId, status: 'PENDING', role: 'MEMBER', recipientUserId: 'principal-member' }],
      [{ id: invitation.id }], [{ id: 'membership-flow' }], [{ sequence: 3n }],
      [{ ...event(3n, 'TEAM_INVITATION_ACCEPTED', invitation.id, 'principal-member'), sequence: 3n, createdAt: new Date() }],
      [{ id: 'member-author' }], [{ userId: actor.principalId }], [comment], [{ sequence: 4n }],
      [{ ...event(4n, 'TEAM_COMMENT_CREATED', comment.id, 'principal-member'), sequence: 4n, createdAt: new Date() }],
    ];
    let flowTeamId = teamId;
    const txQuery = jest.fn(async (query: { sql: string; values: unknown[] }) => {
      if (query.sql.includes('INSERT INTO "teams"')) {
        flowTeamId = String(query.values[0]);
        return [{ ...createdTeam, id: flowTeamId }];
      }
      const rows = queryRows.shift() ?? [];
      if (query.sql.includes('INSERT INTO "team_invitations"') && rows[0]) rows[0].teamId = flowTeamId;
      if (query.sql.includes('FROM "team_invitations"') && rows[0]) rows[0].teamId = flowTeamId;
      if (query.sql.includes('INSERT INTO "activity_events"') && rows[0]) rows[0].teamId = flowTeamId;
      if (query.sql.includes('INSERT INTO "team_comments"') && rows[0]) rows[0].teamId = flowTeamId;
      return rows;
    });
    const auditRows: Array<{ teamId: string; action: string; actorId: string; targetId: string }> = [];
    const txExecute = jest.fn(async (query: { sql: string }) => {
      const match = query.sql.match(/'(TEAM_[A-Z_]+)'/);
      if (query.sql.includes('INSERT INTO "audit_logs"') && match) {
        const values = (query as { values: unknown[] }).values;
        auditRows.push({ teamId: String(values[1]), action: match[1], actorId: String(values[2]), targetId: String(values[3]) });
      }
      return query.sql.includes("SET \"status\" = 'EXPIRED'") ? 0 : 1;
    });
    let committed = false;
    const tx = { $queryRaw: txQuery, $executeRaw: txExecute };
    const prisma = {
      $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => {
        const result = await work(tx); committed = true; return result;
      }),
      $queryRaw: jest.fn(async () => auditRows.map((row, index) => ({ id: `audit-${index}`, teamId: row.teamId, actorId: row.actorId, action: row.action, targetType: 'TEAM', targetId: row.targetId, outcome: 'SUCCESS', metadata: {}, createdAt: new Date() }))),
    };
    const published: TeamActivityEvent[] = [];
    const feed = { publish: jest.fn((item: TeamActivityEvent) => { expect(committed).toBe(true); published.push(item); }) } as unknown as TeamActivityFeedService;
    const service = new TeamsService(prisma as unknown as PrismaService, feed);

    const created = await service.create({ name: 'Design' }, actor.principalId);
    flowTeamId = created.id;
    await service.createInvitation(created.id, actor.principalId, { invitedEmail: invitation.invitedEmail, inviteeUserId: 'principal-member' });
    await service.acceptInvitation('flow-token', 'principal-member');
    await service.createComment(created.id, 'principal-member', comment.body);
    const auditLogs = await service.listAuditLogs(created.id);

    expect(published.map(({ type }) => type)).toEqual(['TEAM_CREATED', 'TEAM_INVITATION_CREATED', 'TEAM_INVITATION_ACCEPTED', 'TEAM_COMMENT_CREATED']);
    expect(published.map(({ actorId }) => actorId)).toEqual([actor.principalId, actor.principalId, 'principal-member', 'principal-member']);
    expect(published.map(({ teamId: eventTeamId }) => eventTeamId)).toEqual([created.id, created.id, created.id, created.id]);
    expect(published[3].payload).toEqual({ targetId: comment.id });
    expect(auditRows.map(({ action }) => action)).toEqual(['TEAM_CREATED', 'TEAM_INVITATION_CREATED', 'TEAM_INVITATION_ACCEPTED', 'TEAM_COMMENT_CREATED']);
    expect(auditRows.map(({ actorId }) => actorId)).toEqual([actor.principalId, actor.principalId, 'principal-member', 'principal-member']);
    expect(auditRows.map(({ teamId: auditTeamId }) => auditTeamId)).toEqual([created.id, created.id, created.id, created.id]);
    expect(auditRows.map(({ targetId }) => targetId)).toEqual([created.id, invitation.id, invitation.id, comment.id]);
    expect(auditLogs.map(({ action }) => action)).toEqual(auditRows.map(({ action }) => action));
    expect(queryRows).toHaveLength(0);
  });
});
