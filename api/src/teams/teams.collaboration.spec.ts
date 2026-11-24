import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../database/prisma.service.js';

describe('Team Collaboration invariants (integration)', () => {
  let app: INestApplication<App>;
  let db: PrismaService;
  let owner: string;
  let member: string;
  let teamId: string;
  const call = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication(); await app.init(); db = app.get(PrismaService);
    const login = async (username: string, password: string) => (await call().post('/auth/login').send({ username, password }).expect(201)).body.access_token as string;
    owner = await login('alice', 'alice-development-password');
    member = await login('bob', 'bob-development-password');
  });

  afterAll(async () => {
    if (teamId) {
      await db.$executeRaw`DELETE FROM "audit_logs" WHERE "team_id" = ${teamId}::uuid`;
      await db.$executeRaw`DELETE FROM "teams" WHERE "id" = ${teamId}::uuid`;
    }
    if (app) await app.close();
  });

  it('enforces live roles, invite lifecycle, activity cursors, comments, mentions, and audit access', async () => {
    const created = await call().post('/teams').set(auth(owner)).send({ name: 'Task 9 integration' }).expect(201);
    teamId = created.body.id;
    const owners = await db.$queryRaw<{ role: string }[]>`SELECT "role"::text AS "role" FROM "team_members" WHERE "team_id" = ${teamId}::uuid AND "user_id" = 'principal-alice'`;
    expect(owners[0].role).toBe('OWNER');
    await call().get(`/teams/${teamId}/comments`).set(auth(member)).expect(403);
    await call().post(`/teams/${teamId}/comments`).set(auth(member)).send({ body: 'no access' }).expect(403);
    await call().get(`/teams/${teamId}/audit-logs`).set(auth(member)).expect(403);

    const invite = await call().post(`/teams/${teamId}/invitations`).set(auth(owner)).send({ invitedEmail: 'bob@example.test', inviteeUserId: 'principal-bob' }).expect(201);
    await call().post(`/teams/${teamId}/invitations`).set(auth(owner)).send({ invitedEmail: 'bob@example.test', inviteeUserId: 'principal-bob' }).expect(409);
    await call().post('/teams/invitations/accept').set(auth(owner)).send({ token: invite.body.token }).expect(403);
    await call().post('/teams/invitations/accept').set(auth(member)).send({ token: invite.body.token }).expect(201);
    await call().post('/teams/invitations/accept').set(auth(member)).send({ token: invite.body.token }).expect(409);

    const expired = await call().post(`/teams/${teamId}/invitations`).set(auth(owner)).send({ invitedEmail: 'bob@example.test', inviteeUserId: 'principal-bob' }).expect(201);
    await db.$executeRaw`UPDATE "team_invitations" SET "expires_at" = CURRENT_TIMESTAMP - INTERVAL '1 second' WHERE "id" = ${expired.body.id}::uuid`;
    await call().post('/teams/invitations/accept').set(auth(member)).send({ token: expired.body.token }).expect(410);
    const revoked = await call().post(`/teams/${teamId}/invitations`).set(auth(owner)).send({ invitedEmail: 'bob@example.test', inviteeUserId: 'principal-bob' }).expect(201);
    await call().delete(`/teams/${teamId}/invitations/${revoked.body.id}`).set(auth(owner)).expect(200);

    await db.$executeRaw`UPDATE "team_members" SET "role" = 'ADMIN'::"TeamRole" WHERE "team_id" = ${teamId}::uuid AND "user_id" = 'principal-bob'`;
    const adminLogs = await call().get(`/teams/${teamId}/audit-logs?action=TEAM_INVITATION_CREATED&actorId=principal-alice`).set(auth(member)).expect(200);
    expect(adminLogs.body.length).toBeGreaterThan(0);
    expect(Object.keys(adminLogs.body[0])).toEqual(expect.arrayContaining(['id', 'teamId', 'actorId', 'action', 'targetType', 'targetId', 'outcome', 'metadata', 'createdAt']));
    expect(JSON.stringify(adminLogs.body)).not.toContain(invite.body.token);
    await db.$executeRaw`UPDATE "team_members" SET "role" = 'MEMBER'::"TeamRole" WHERE "team_id" = ${teamId}::uuid AND "user_id" = 'principal-bob'`;
    await call().get(`/teams/${teamId}/audit-logs`).set(auth(member)).expect(403);
    await call().post(`/teams/${teamId}/invitations`).set(auth(member)).send({ invitedEmail: 'alice@example.test' }).expect(403);

    await call().post(`/teams/${teamId}/comments`).set(auth(member)).send({ body: '   ' }).expect(400);
    const comment = await call().post(`/teams/${teamId}/comments`).set(auth(member)).send({ body: 'Hi @principal-alice @principal-bob @principal-unknown' }).expect(201);
    expect(comment.body.mentions.sort()).toEqual(['principal-alice', 'principal-bob']);
    expect((await call().get(`/teams/${teamId}/comments`).set(auth(member)).expect(200)).body).toHaveLength(1);
    const events = (await call().get(`/teams/${teamId}/activity?afterSeq=0`).set(auth(member)).expect(200)).body;
    const seq = events.map((event: { sequence: string }) => BigInt(event.sequence));
    expect(seq.every((n: bigint, i: number) => n === BigInt(i + 1))).toBe(true);
    const resumed = (await call().get(`/teams/${teamId}/activity?afterSeq=${seq[0]}`).set(auth(member)).expect(200)).body;
    expect(resumed.map((event: { id: string }) => event.id)).toEqual(events.slice(1).map((event: { id: string }) => event.id));
    expect(events.some((event: { type: string }) => event.type === 'TEAM_COMMENT_CREATED')).toBe(true);
  });
});
