import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { MessageEvent } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { Observable, Subscriber } from 'rxjs';
import { randomUUID } from 'node:crypto';
import type { Principal } from '../auth/auth.types.js';
import { PrismaService } from '../database/prisma.service.js';

export interface TeamActivityEvent {
  teamId: string;
  sequence: string;
  type: string;
  actorId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

type ActivityRow = Omit<TeamActivityEvent, 'sequence' | 'createdAt'> & {
  sequence: bigint | string;
  createdAt: Date | string;
};
type TeamRole = 'OWNER' | 'ADMIN' | 'MEMBER';

interface FeedConnection {
  id: string;
  teamId: string;
  principal: Principal;
  observer: Subscriber<MessageEvent>;
  authorizedRole: TeamRole | null;
  lastSequence: bigint;
  replaying: boolean;
  replayBuffer: TeamActivityEvent[];
  pending: Map<bigint, TeamActivityEvent>;
  lastPongAt: number;
  timer: ReturnType<typeof setInterval>;
  closed: boolean;
}

@Injectable()
export class TeamActivityFeedService {
  private readonly connections = new Map<string, FeedConnection>();
  private readonly teamConnections = new Map<string, Set<string>>();
  private readonly heartbeatMs = 15_000;
  private readonly pongTimeoutMs = 45_000;

  constructor(private readonly prisma: PrismaService) {}

  stream(teamId: string, principal: Principal, afterSequence = '0'): Observable<MessageEvent> {
    const cursor = this.parseCursor(afterSequence);
    return new Observable((observer) => {
      const connection: FeedConnection = {
        id: randomUUID(), teamId, principal, observer, authorizedRole: null, lastSequence: cursor,
        replaying: true, replayBuffer: [], pending: new Map(), lastPongAt: Date.now(),
        timer: setInterval(() => { void this.heartbeat(connection); }, this.heartbeatMs), closed: false,
      };
      this.connections.set(connection.id, connection);
      const teamSet = this.teamConnections.get(teamId) ?? new Set<string>();
      teamSet.add(connection.id);
      this.teamConnections.set(teamId, teamSet);
      observer.next({ type: 'connected', data: { connectionId: connection.id, teamId, afterSequence: cursor.toString() } });
      void this.authorizeAndReplay(connection).catch(() => this.revoke(connection));
      return () => this.remove(connection);
    });
  }

  publish(event: TeamActivityEvent): void {
    for (const id of this.teamConnections.get(event.teamId) ?? []) {
      const connection = this.connections.get(id);
      if (!connection || connection.closed) continue;
      if (connection.replaying) connection.replayBuffer.push(event);
      else void this.deliverIfAuthorized(connection, event).catch(() => this.revoke(connection));
    }
  }

  acknowledge(teamId: string, connectionId: string, principalId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.closed || connection.teamId !== teamId || connection.principal.principalId !== principalId) {
      throw new NotFoundException('Activity feed connection not found.');
    }
    connection.lastPongAt = Date.now();
  }

  private async authorizeAndReplay(connection: FeedConnection): Promise<void> {
    const [membership] = await this.prisma.$queryRaw<{ role: string }[]>(Prisma.sql`
      SELECT "role"::text AS "role" FROM "team_members"
      WHERE "team_id" = ${connection.teamId}::uuid
        AND "user_id" = ${connection.principal.principalId}
      LIMIT 1
    `);
    if (!this.isTeamRole(membership?.role)) {
      this.revoke(connection);
      return;
    }
    connection.authorizedRole = membership.role;
    await this.replay(connection);
  }

  private async replay(connection: FeedConnection): Promise<void> {
    const rows = await this.prisma.$queryRaw<ActivityRow[]>(Prisma.sql`
      SELECT "team_id" AS "teamId", "sequence"::text AS "sequence", "type",
        "actor_id" AS "actorId", "metadata" AS "payload", "created_at" AS "createdAt"
      FROM "activity_events" WHERE "team_id" = ${connection.teamId}::uuid
        AND "sequence" > ${connection.lastSequence.toString()}::bigint
      ORDER BY "sequence" ASC
    `);
    if (connection.closed) return;
    if (!(await this.isStillAuthorized(connection))) return;
    for (const row of rows) this.queue(connection, this.toEvent(row));
    connection.replaying = false;
    const buffered = connection.replayBuffer.splice(0).sort((a, b) => this.sequence(a) < this.sequence(b) ? -1 : 1);
    for (const event of buffered) this.queue(connection, event);
  }

  private async deliverIfAuthorized(connection: FeedConnection, event: TeamActivityEvent): Promise<void> {
    if (connection.closed || !(await this.isStillAuthorized(connection))) return;
    this.queue(connection, event);
  }

  private async isStillAuthorized(connection: FeedConnection): Promise<boolean> {
    if (connection.closed || !connection.authorizedRole) return false;
    const [membership] = await this.prisma.$queryRaw<{ role: string }[]>(Prisma.sql`
      SELECT "role"::text AS "role" FROM "team_members"
      WHERE "team_id" = ${connection.teamId}::uuid
        AND "user_id" = ${connection.principal.principalId}
      LIMIT 1
    `);
    if (membership?.role !== connection.authorizedRole) {
      this.revoke(connection);
      return false;
    }
    return true;
  }

  private isTeamRole(role: string | undefined): role is TeamRole {
    return role === 'OWNER' || role === 'ADMIN' || role === 'MEMBER';
  }

  private toEvent(row: ActivityRow): TeamActivityEvent {
    return {
      teamId: row.teamId, sequence: String(row.sequence), type: row.type, actorId: row.actorId,
      payload: row.payload ?? {}, createdAt: new Date(row.createdAt).toISOString(),
    };
  }

  private queue(connection: FeedConnection, event: TeamActivityEvent): void {
    const sequence = this.sequence(event);
    if (sequence <= connection.lastSequence) return;
    connection.pending.set(sequence, event);
    while (connection.pending.has(connection.lastSequence + 1n)) {
      const nextSequence = connection.lastSequence + 1n;
      const next = connection.pending.get(nextSequence)!;
      connection.pending.delete(nextSequence);
      connection.lastSequence = nextSequence;
      connection.observer.next({ type: next.type, id: next.sequence, data: next });
    }
  }

  private sequence(event: TeamActivityEvent): bigint {
    return BigInt(event.sequence);
  }

  private parseCursor(value: string): bigint {
    if (!/^(0|[1-9]\d*)$/.test(value)) throw new BadRequestException('afterSequence must be a non-negative integer.');
    const cursor = BigInt(value);
    if (cursor > 9223372036854775807n) throw new BadRequestException('afterSequence is outside the supported range.');
    return cursor;
  }

  private async heartbeat(connection: FeedConnection): Promise<void> {
    if (connection.closed) return;
    if (Date.now() - connection.lastPongAt >= this.pongTimeoutMs) {
      connection.observer.next({ type: 'timeout', data: { connectionId: connection.id } });
      connection.observer.complete();
      this.remove(connection);
      return;
    }
    try {
      if (!(await this.isStillAuthorized(connection))) return;
    } catch {
      this.revoke(connection);
      return;
    }
    if (connection.closed) return;
    connection.observer.next({ type: 'ping', data: { connectionId: connection.id, sentAt: new Date().toISOString() } });
  }

  private revoke(connection: FeedConnection): void {
    if (connection.closed) return;
    connection.observer.next({ type: 'authorization_revoked', data: { teamId: connection.teamId } });
    connection.observer.complete();
    this.remove(connection);
  }

  private remove(connection: FeedConnection): void {
    if (connection.closed) return;
    connection.closed = true;
    clearInterval(connection.timer);
    this.connections.delete(connection.id);
    const teamSet = this.teamConnections.get(connection.teamId);
    teamSet?.delete(connection.id);
    if (teamSet?.size === 0) this.teamConnections.delete(connection.teamId);
  }
}
