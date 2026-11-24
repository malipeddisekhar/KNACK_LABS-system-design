# CI Pipeline and Production Readiness

## CI verification sequence

Run each step in a clean CI job with a nonzero exit on failure:

1. Check out the exact commit and install from scratch with `npm ci` (no developer `node_modules` or local cache assumptions).
2. Provision an ephemeral PostgreSQL service owned by the job, create only the guarded database `url_shortener_test`, and pass its connection through `TEST_DATABASE_URL`. Do not read a developer `.env` or reuse a shared/production database.
3. Apply the schema with `npx prisma migrate deploy --config prisma7.test.config.ts`. The config verifies the database name is exactly `url_shortener_test` before applying migrations.
4. Generate the Prisma client with `npx prisma generate --config prisma7.config.ts` using a CI-local `DATABASE_URL` for generation/config resolution; do not expose either URL in logs.
5. Run the mocked team suite: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand`.
6. Run database-backed integration tests only after the PostgreSQL service and migrations pass. Each test must create and clean its own state, assert response bodies plus database/audit/activity side effects, and exercise role denials and expiry/replay edges.
7. Run `node ./node_modules/@nestjs/cli/bin/nest.js build` and `git diff --check`. The job is green only when install, migrations, tests, build, and diff check all exit 0; missing services or any failing check must fail the job, not be silently skipped.

## Readiness results for this BUILD

| Check | Result | Evidence / limit |
|---|---|---|
| Focused mocked Jest suites | PASS, 2 suites / 22 tests | `team-activity-feed.spec.ts` and `team-collaboration-contracts.spec.ts`, run together with `--runInBand` |
| Nest build | PASS, exit 0 | `node ./node_modules/@nestjs/cli/bin/nest.js build` |
| Whitespace validation | PASS, exit 0 | `git diff --check`; Git emitted an existing CRLF-to-LF warning for `src/app.module.ts` |
| PostgreSQL reachability | NOT AVAILABLE | `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` returned `False` |
| Live DB migrations and HTTP/integration journey | NOT EXECUTED | Local PostgreSQL was unreachable; no live behavior is inferred from mocked unit tests |
| Persistent CI workflow file | NOT ADDED in this task | This artifact specifies the required gate; repository workflow wiring needs a CI runner/service definition and is not represented as completed here |

## Scope and gaps to close before production

The tests create their own fixtures in mocks and exercise the real team service, role guard, DTO validation pipe, controller methods, and feed lifecycle in process. They do not prove PostgreSQL locking/constraint behavior, actual HTTP status and middleware composition, or multi-instance SSE delivery. The current schema/controller also have no VIEWER role, member-removal/role-change/team-delete route, or task-bound comments; those permission-matrix cells and scenarios cannot be claimed as tested until such features exist.

Before release, CI should run the integrated database-backed scenario with ephemeral PostgreSQL and verify all persisted state transitions. Add explicit integration cases for duplicate pending invitations, existing-member invitation rejection, expired/replayed acceptance, removed-member comment denial, concurrent role changes, and stable audit/event sequence. If deployments use multiple API instances, first add and verify a shared event bus/outbox strategy; the current feed is process-local. Audit metadata currently includes invitation email and must be covered by the team's privacy/retention policy.
