# Setup Instructions and Architectural Decision Record

## Fresh-environment setup

1. Check out the repository and enter the API directory. Confirm Node.js and npm are installed with `node --version` and `npm --version`; this package does not declare a Node `engines` range, so use the version pinned by the team's CI/runtime policy when available.
2. Install exactly from the committed npm lockfile: `npm ci`. Do not rely on a developer's pre-existing `node_modules` or global Nest/Prisma binaries.
3. Provision a disposable local PostgreSQL instance and create a database named `url_shortener_test` for tests. PostgreSQL must be reachable at the host/port in the local test URL before database-backed checks are attempted.
4. Create a local `.env` from `.env.example` without copying credentials from another machine. Set `DATABASE_URL` to a disposable local development database; set `TEST_DATABASE_URL` explicitly to the disposable database whose database name is exactly `url_shortener_test`. Also configure `JWT_SECRET` with at least 32 characters and sufficient character diversity. `PORT` defaults to 3000 and `PUBLIC_BASE_URL` defaults to the local origin; `REDIS_URL` and `RETENTION_DAYS` are also present in the example environment file. Never commit `.env` or print its values.
5. Generate the Prisma client from the repository schema: `npx prisma generate --config prisma7.config.ts`.
6. Apply migrations only to the intentionally selected disposable local database: `npx prisma migrate deploy --config prisma7.config.ts`. Before running it, inspect the local `DATABASE_URL` target privately. For test-config migrations use `npx prisma migrate deploy --config prisma7.test.config.ts`; that config refuses any `TEST_DATABASE_URL` whose database name is not exactly `url_shortener_test`.
7. Start the API with `npm run start:dev`, then verify the health endpoint at `http://127.0.0.1:3000/health`. No team seed data is required: create a team through `POST /teams` using a local authenticated principal.
8. Run the mocked team checks with `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand`, then run `node ./node_modules/@nestjs/cli/bin/nest.js build` and `git diff --check`.
9. Only after the local PostgreSQL service is reachable, the guarded test URL is verified, and migrations have been applied to that test database, run database-backed HTTP/integration checks. Never point tests or migration commands at production or a shared database.

The current verification environment reports `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` as `False`. Accordingly, live PostgreSQL/HTTP requests, migration application, and DB-backed integration tests are **NOT EXECUTED** here; the documented setup steps are not a claim that a fresh host was bootstrapped successfully in this session.

## ADR: Team Collaboration boundaries

**Status:** Adopted in the current implementation; operational rollout still requires database-backed verification.

**Live RBAC.** Team authorization is derived from a fresh, parameterized lookup of `team_members` scoped by both requested `teamId` and authenticated `principalId`. The principal supplies identity (`principalId`, `username`); token claims are not treated as authoritative team roles. `OWNER`/`ADMIN` protect management and audit routes, while `OWNER`/`ADMIN`/`MEMBER` may use comments and activity endpoints.

**Transactional state and publication.** Mutations write domain rows, audit rows, and the per-team-sequenced `ActivityEvent` in one database transaction. The service publishes the typed event to the in-process feed only after the transaction commits, avoiding notifications for rolled-back writes. This gives atomic database state and post-commit local delivery; it does not promise durable outbox delivery or cross-process fan-out.

**Activity delivery.** The implementation uses Server-Sent Events (SSE), an explicitly chosen one-way server-to-client stream; the curriculum prompt's “WebSockets versus polling” question is not a claim that this code uses WebSockets. The feed supports sequence replay, heartbeat/pong timeout cleanup, and live membership/role rechecks before replay/delivery and during heartbeats. Connection state and publication are process-local, so multi-instance deployment requires a shared event transport and must be validated before enabling horizontal fan-out.

**Audit design.** `AuditLog` rows capture actor, team, action, target, outcome, metadata, and timestamp, and are written atomically with supported mutations. Metadata should remain minimal and secret-free. Invitation creation currently records invited email in audit metadata; authorization and retention policy should treat that field as personal data.

**Rollout and rollback guardrails.** Apply schema migrations to a disposable/test database first, run the isolated contract suite and build, then run database-backed integration checks against `url_shortener_test`. Promote only after schema compatibility, role boundaries, transaction side effects, and reconnect behavior are verified. Keep a tested rollback path for the application release and a separate, reviewed database recovery plan; do not assume a code rollback reverses an applied schema migration.

**Known capability gaps.** The schema and controller define only OWNER/ADMIN/MEMBER; there is no VIEWER role, member-removal or role-change endpoint, team-delete endpoint, or task entity/comment endpoint in the inspected implementation. The mocked state-threading test covers team creation, invitation creation and acceptance, a team comment with a mention, feed publication, and audit records; it is not a live HTTP/database integration test.
