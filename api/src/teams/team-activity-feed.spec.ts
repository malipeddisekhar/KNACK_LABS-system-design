import { BadRequestException, ExecutionContext, ForbiddenException, NotFoundException } from '@nestjs/common';
import type { MessageEvent as NestMessageEvent } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';
import { TeamRoleGuard } from './team-role.guard.js';
import { TeamActivityFeedService, type TeamActivityEvent } from './team-activity-feed.service.js';
import { TeamsController } from './teams.controller.js';
import { TeamsService } from './teams.service.js';

let teamId: string;
let principal: Principal;
const activity = (sequence: string): TeamActivityEvent => ({
  teamId, sequence, type: 'TEAM_COMMENT_CREATED', actorId: principal.principalId,
  payload: { mentionCount: 0 }, createdAt: '2026-11-22T00:00:00.000Z',
});
const row = (sequence: bigint) => ({ ...activity(sequence.toString()), sequence, createdAt: new Date('2026-11-22T00:00:00.000Z') });
const turn = () => new Promise<void>((resolve) => setImmediate(resolve));
const subscriptions: Array<{ unsubscribe: () => void }> = [];
const track = <T extends { unsubscribe: () => void }>(subscription: T): T => {
  subscriptions.push(subscription);
  return subscription;
};
const liveFeedDb = (history: unknown[] = []) => ({
  $queryRaw: jest.fn((query: { sql: string }) => Promise.resolve(
    query.sql.includes('FROM "team_members"') ? [{ role: 'MEMBER' }] : history,
  )),
});

describe('TeamActivityFeedService functional verification', () => {
  beforeEach(() => {
    teamId = randomUUID();
    principal = { principalId: `principal-${randomUUID()}`, username: 'reader' };
  });

  afterEach(() => {
    for (const subscription of subscriptions.splice(0)) subscription.unsubscribe();
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  it('Scenario 1: authenticates and subscribes only after live team membership authorization', async () => {
    const authService = { verifyToken: jest.fn().mockResolvedValue(principal) };
    const request = { headers: { authorization: 'Bearer test-token' } } as { headers: { authorization: string }; user?: Principal };
    const authContext = { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
    await expect(new JwtAuthGuard(authService as never).canActivate(authContext)).resolves.toBe(true);
    expect(request.user).toEqual(principal);

    const reflector = { getAllAndOverride: jest.fn().mockReturnValue(['OWNER', 'ADMIN', 'MEMBER']) };
    const queryRaw = jest.fn().mockResolvedValue([{ role: 'MEMBER' }]);
    const guard = new TeamRoleGuard(reflector as never, { $queryRaw: queryRaw } as unknown as PrismaService);
    const roleContext = {
      getHandler: () => ({}), getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ params: { id: teamId }, user: principal }) }),
    } as unknown as ExecutionContext;
    await expect(guard.canActivate(roleContext)).resolves.toBe(true);
    const sql = queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(sql.sql).toContain('"team_id" =');
    expect(sql.sql).toContain('"user_id" =');
    expect(sql.values).toEqual(expect.arrayContaining([teamId, principal.principalId]));

    const feed = new TeamActivityFeedService(liveFeedDb() as unknown as PrismaService);
    const messages: NestMessageEvent[] = [];
    const connection = track(feed.stream(teamId, request.user!, '0').subscribe((message) => messages.push(message)));
    expect(messages[0]).toMatchObject({ type: 'connected', data: { teamId, afterSequence: '0' } });
    await turn();
    feed.publish(activity('1'));
    await turn();
    expect(messages.at(-1)?.data).toMatchObject({ teamId, sequence: '1' });
    connection.unsubscribe();

    reflector.getAllAndOverride.mockReturnValueOnce(['OWNER', 'ADMIN']);
    await expect(guard.canActivate(roleContext)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('Scenario 2: delivers a typed team activity when service work commits', async () => {
    const feed = new TeamActivityFeedService(liveFeedDb() as unknown as PrismaService);
    const messages: NestMessageEvent[] = [];
    const connection = track(feed.stream(teamId, principal).subscribe((message) => messages.push(message)));
    await turn();

    let committed = false;
    const tx = {
      $queryRaw: jest.fn()
        .mockResolvedValueOnce([{ id: teamId, name: 'Design', createdAt: new Date(), updatedAt: new Date() }])
        .mockResolvedValueOnce([{ sequence: 1n }])
        .mockResolvedValueOnce([{ teamId, sequence: 1n, type: 'TEAM_CREATED', actorId: principal.principalId, payload: { name: 'Design' }, createdAt: new Date('2026-11-22T00:00:00.000Z') }]),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    const prisma = { $transaction: jest.fn(async (work: (client: typeof tx) => Promise<unknown>) => { const result = await work(tx); committed = true; return result; }) };
    const publish = feed.publish.bind(feed);
    const publishSpy = jest.spyOn(feed, 'publish').mockImplementation((event) => { expect(committed).toBe(true); publish(event); });
    const service = new TeamsService(prisma as unknown as PrismaService, feed);
    await expect(service.create({ name: 'Design' }, principal.principalId)).resolves.toMatchObject({ id: teamId });
    expect(publishSpy).toHaveBeenCalledTimes(1);
    expect(messages.at(-1)?.data).toMatchObject({
      teamId, sequence: '1', type: 'TEAM_CREATED', actorId: principal.principalId,
      payload: { name: 'Design' }, createdAt: '2026-11-22T00:00:00.000Z',
    });
    connection.unsubscribe();
  });

  it('Scenario 2 follow-up: keeps one open subscriber receiving sequences 1, 2, and 3 after a heartbeat', async () => {
    jest.useFakeTimers();
    try {
      const prisma = { ...liveFeedDb(), $transaction: jest.fn() };
      const feed = new TeamActivityFeedService(prisma as unknown as PrismaService);
      const messages: NestMessageEvent[] = [];
      const connection = track(feed.stream(teamId, principal, '0').subscribe((message) => messages.push(message)));
      const connectionId = (messages[0].data as { connectionId: string }).connectionId;
      await jest.advanceTimersByTimeAsync(15_000);
      expect(messages.some((message) => message.type === 'ping')).toBe(true);
      feed.acknowledge(teamId, connectionId, principal.principalId);

      const tx = { $queryRaw: jest.fn(), $executeRaw: jest.fn() };
      prisma.$transaction.mockImplementation(async (work: (client: typeof tx) => Promise<unknown>) => work(tx));
      const service = new TeamsService(prisma as unknown as PrismaService, feed);
      for (let sequence = 1; sequence <= 3; sequence++) {
        const createdAt = new Date(`2026-11-22T00:00:0${sequence}.000Z`);
        tx.$queryRaw
          .mockResolvedValueOnce([{ id: 'member-1' }])
          .mockResolvedValueOnce([{ id: `comment-${sequence}`, teamId, authorId: principal.principalId, body: `Activity ${sequence}`, mentions: [], createdAt }])
          .mockResolvedValueOnce([{ sequence: BigInt(sequence) }])
          .mockResolvedValueOnce([{ teamId, sequence: BigInt(sequence), type: 'TEAM_COMMENT_CREATED', actorId: principal.principalId, payload: { mentionCount: 0 }, createdAt }]);
        await service.createComment(teamId, principal.principalId, `Activity ${sequence}`);
        await Promise.resolve();
        await Promise.resolve();
      }

      const delivered = messages
        .map((message) => message.data as TeamActivityEvent)
        .filter((event) => event.sequence)
        .map((event) => event.sequence);
      expect(delivered).toEqual(['1', '2', '3']);
      expect(connection.closed).toBe(false);
      connection.unsubscribe();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it.each([
    ['removed', []],
    ['role changed', [{ role: 'MEMBER' }]],
  ])('revokes an open stream before delivery when membership is %s', async (_caseName, currentRows) => {
    const roleRows = [{ role: 'OWNER' }, { role: 'OWNER' }, currentRows];
    const queryRaw = jest.fn((query: { sql: string }) => Promise.resolve(
      query.sql.includes('FROM "team_members"') ? (roleRows.shift() ?? []) : [],
    ));
    const feed = new TeamActivityFeedService({ $queryRaw: queryRaw } as unknown as PrismaService);
    const messages: NestMessageEvent[] = [];
    let completed = false;
    const connection = track(feed.stream(teamId, principal, '0').subscribe({
      next: (message) => messages.push(message),
      complete: () => { completed = true; },
    }));
    await turn();

    feed.publish(activity('1'));
    await turn();

    expect(completed).toBe(true);
    expect(messages.some((message) => (message.data as TeamActivityEvent).sequence === '1')).toBe(false);
    expect(messages.some((message) => message.type === 'authorization_revoked')).toBe(true);
    expect(connection.closed).toBe(true);
  });

  it('Scenario 3: disconnect removes the subscription and heartbeat timer without crashing', async () => {
    jest.useFakeTimers();
    try {
      const feed = new TeamActivityFeedService(liveFeedDb() as unknown as PrismaService);
      const messages: NestMessageEvent[] = [];
      const connection = track(feed.stream(teamId, principal).subscribe((message) => messages.push(message)));
      const connectionId = (messages[0].data as { connectionId: string }).connectionId;
      expect(jest.getTimerCount()).toBe(1);
      expect(() => connection.unsubscribe()).not.toThrow();
      expect(jest.getTimerCount()).toBe(0);
      expect(() => feed.publish(activity('1'))).not.toThrow();
      expect(() => feed.acknowledge(teamId, connectionId, principal.principalId)).toThrow(NotFoundException);
      expect(messages.some((message) => (message.data as TeamActivityEvent).sequence === '1')).toBe(false);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('Scenario 4: reconnects after disconnect and replays only persisted events after lastSequence', async () => {
    const history = [[row(1n)], [row(2n)]];
    const queryRaw = jest.fn((query: { sql: string }) => Promise.resolve(
      query.sql.includes('FROM "team_members"') ? [{ role: 'MEMBER' }] : (history.shift() ?? []),
    ));
    const feed = new TeamActivityFeedService({ $queryRaw: queryRaw } as unknown as PrismaService);
    const firstMessages: NestMessageEvent[] = [];
    const first = track(feed.stream(teamId, principal, '0').subscribe((message) => firstMessages.push(message)));
    await turn();
    expect(firstMessages.map((message) => (message.data as TeamActivityEvent).sequence).filter(Boolean)).toEqual(['1']);
    first.unsubscribe();

    const resumedMessages: NestMessageEvent[] = [];
    const resumed = track(feed.stream(teamId, principal, '1').subscribe((message) => resumedMessages.push(message)));
    await turn();
    expect(resumedMessages.map((message) => (message.data as TeamActivityEvent).sequence).filter(Boolean)).toEqual(['2']);
    expect(queryRaw).toHaveBeenCalledTimes(6);
    resumed.unsubscribe();
  });

  it('sends heartbeat pings and removes connections that miss pong acknowledgements', async () => {
    jest.useFakeTimers();
    let cleanup: (() => void) | undefined;
    try {
      const feed = new TeamActivityFeedService(liveFeedDb() as unknown as PrismaService);
      const messages: NestMessageEvent[] = [];
      let completed = false;
      const subscription = track(feed.stream(teamId, principal).subscribe({ next: (message) => messages.push(message), complete: () => { completed = true; } }));
      cleanup = () => subscription.unsubscribe();
      const connectionId = (messages[0].data as { connectionId: string }).connectionId;
      await jest.advanceTimersByTimeAsync(15_000);
      expect(messages.some((message) => message.type === 'ping')).toBe(true);
      feed.acknowledge(teamId, connectionId, principal.principalId);
      await jest.advanceTimersByTimeAsync(30_000);
      expect(completed).toBe(false);
      await jest.advanceTimersByTimeAsync(15_000);
      expect(messages.some((message) => message.type === 'timeout')).toBe(true);
      expect(completed).toBe(true);
      expect(() => feed.acknowledge(teamId, connectionId, principal.principalId)).toThrow(NotFoundException);
    } finally {
      cleanup?.();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('validates stream cursors and resolves Last-Event-ID before opening the stream', () => {
    const feed = new TeamActivityFeedService(liveFeedDb() as unknown as PrismaService);
    expect(() => feed.stream(teamId, principal, '-1')).toThrow(BadRequestException);
    expect(() => feed.stream(teamId, principal, '9223372036854775808')).toThrow(BadRequestException);

    const stream = jest.fn();
    const controller = new TeamsController({} as TeamsService, { stream } as unknown as TeamActivityFeedService);
    controller.streamActivity(teamId, principal, undefined, undefined, '23');
    expect(stream).toHaveBeenCalledWith(teamId, principal, '23');
    expect(() => controller.streamActivity(teamId, principal, '01'))
      .toThrow(BadRequestException);
  });

  it('does not authorize a subscriber using membership from a different team', async () => {
    const queryRaw = jest.fn().mockResolvedValue([]);
    const feed = new TeamActivityFeedService({ $queryRaw: queryRaw } as unknown as PrismaService);
    const messages: NestMessageEvent[] = [];
    let completed = false;
    const connection = track(feed.stream(teamId, principal).subscribe({
      next: (message) => messages.push(message),
      complete: () => { completed = true; },
    }));
    await turn();

    const membershipQuery = queryRaw.mock.calls[0][0] as { sql: string; values: unknown[] };
    expect(membershipQuery.sql).toContain('FROM "team_members"');
    expect(membershipQuery.values).toEqual(expect.arrayContaining([teamId, principal.principalId]));
    expect(completed).toBe(true);
    expect(messages.some((message) => message.type === 'authorization_revoked')).toBe(true);
    expect(connection.closed).toBe(true);
  });

  it('accepts pong only for the connection owner and team', () => {
    jest.useFakeTimers();
    try {
      const feed = new TeamActivityFeedService(liveFeedDb() as unknown as PrismaService);
      const messages: NestMessageEvent[] = [];
      const connection = track(feed.stream(teamId, principal).subscribe((message) => messages.push(message)));
      const connectionId = (messages[0].data as { connectionId: string }).connectionId;
    expect(() => feed.acknowledge(randomUUID(), connectionId, principal.principalId))
        .toThrow(NotFoundException);
      expect(() => feed.acknowledge(teamId, connectionId, 'principal-other')).toThrow(NotFoundException);

      const controller = new TeamsController({} as TeamsService, feed);
      expect(controller.activityPong(teamId, connectionId, principal)).toEqual({ acknowledged: true });
      connection.unsubscribe();
      expect(jest.getTimerCount()).toBe(0);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });
});
