# Module 08 VERIFY — Readiness Evidence

**Scope:** Source and document review plus mocked in-process verification. No `prisma/` or `package.json` edits were made for this review. PostgreSQL at `127.0.0.1:5432` was unreachable, so live HTTP calls, migrations, and database-backed integration tests are **NOT EXECUTED**.

## 1. Endpoint Authorization

`RequireTeamRoles(...)` composes `JwtAuthGuard` then `TeamRoleGuard`. The role guard reads the caller's current `team_members` role with both `team_id` and `user_id` parameters; it denies missing membership and roles outside the route's allow-list. `POST /teams` and `POST /teams/invitations/accept` use `JwtAuthGuard` directly. Every route found in `TeamsController` has one of these guard paths; no unguarded controller route was found.

| Route | Authentication | Live authorization | Evidence |
|---|---|---|---|
| `GET /teams/:id/activity` | `JwtAuthGuard` via `RequireTeamRoles` | OWNER, ADMIN, MEMBER for `:id` | `teams.controller.ts` `activity`; `team-role.guard.ts` |
| `GET /teams/:id/activity/stream` (SSE) | `JwtAuthGuard` via `RequireTeamRoles` | OWNER, ADMIN, MEMBER at connect; feed rechecks membership and role | `streamActivity`; `TeamActivityFeedService.stream`, `authorizeAndReplay`, `isStillAuthorized`, `heartbeat` |
| `POST /teams/:id/activity/stream/:connectionId/pong` | `JwtAuthGuard` via `RequireTeamRoles` | OWNER, ADMIN, MEMBER plus connection/team/principal ownership | `activityPong`; `TeamActivityFeedService.acknowledge` |
| `POST /teams/:id/comments` | `JwtAuthGuard` via `RequireTeamRoles` | OWNER, ADMIN, MEMBER; service also verifies author's membership scoped to team | `createComment`; `TeamsService.createComment` |
| `GET /teams/:id/comments` | `JwtAuthGuard` via `RequireTeamRoles` | OWNER, ADMIN, MEMBER for `:id` | `listComments` |
| `GET /teams/:id/audit-logs` | `JwtAuthGuard` via `RequireTeamRoles` | OWNER or ADMIN for `:id` | `auditLogs` |
| `POST /teams` | `JwtAuthGuard` | Authenticated principal creates a team and OWNER membership | `create` |
| `POST /teams/invitations/accept` | `JwtAuthGuard` | Invitation token is bound to the authenticated principal ID | `acceptInvitation`; `TeamsService.acceptInvitation` |
| `POST /teams/:id/invitations` | `JwtAuthGuard` via `RequireTeamRoles` | OWNER or ADMIN for `:id` | `createInvitation` |
| `DELETE /teams/:id/invitations/:invitationId` | `JwtAuthGuard` via `RequireTeamRoles` | OWNER or ADMIN for `:id`; service scopes invitation to team and requires PENDING | `revokeInvitation` |

`ParseUUIDPipe` validates team IDs and the invitation/connection IDs on the routes that accept them. The test suite verifies the guard's OWNER/ADMIN allow path, MEMBER and absent-member denials, team/principal query scoping, SSE membership revocation after removal/role change, and pong ownership. These are unit/contract results, not live HTTP results.

The schema and implementation support OWNER/ADMIN/MEMBER only. There is no VIEWER role, member-removal or role-change route, or team-delete route; those operations cannot be claimed covered by this authorization table.

## 2. Input Validation

The global Nest `ValidationPipe` enables `whitelist`, `forbidNonWhitelisted`, and `transform` (`src/app.module.ts`). DTO validation is applied to body payloads. Service-level trim checks add behavior that the DTO decorators alone do not guarantee.

| Route/input | Validation in code | Review result |
|---|---|---|
| `POST /teams` → `name` | `CreateTeamDto`: string, non-empty, max 100; service trims and rejects whitespace-only | Implemented. There is no special “injection character” deny-list; SQL values are parameterized, so such a filter is not being claimed. |
| `POST /teams/:id/invitations` → `invitedEmail` | `IsEmail`, max 254; service trims and lowercases before storage | Implemented. |
| Same → `inviteeUserId` | Required string, non-empty, max 128; service trims and rejects blank binding | Implemented; this explicitly binds to `principalId`, not an invented email lookup. |
| Same → `role` | Optional; only `ADMIN` or `MEMBER` accepted by `IsIn`; absent means MEMBER | Implemented. OWNER cannot be granted by this DTO. |
| `POST /teams/invitations/accept` → `token` | Required string, non-empty, max 128; service hashes presented token with SHA-256 and checks pending/expiry/recipient binding | Implemented. Invalid token outcomes are 404/403/409/410 according to state; token value is never included in the error message. |
| `POST /teams/:id/comments` → `body` | String, non-empty, max 5000; service trims and rejects whitespace-only | Implemented. |
| Comment `@<principalId>` mentions | Parsed from `body` using a bounded identifier pattern; candidate IDs are resolved only from `team_members` rows for the same team | Team-scoped mention resolution is implemented. There is no separate mention DTO field or notification endpoint. |
| `GET /teams/:id/activity` → `afterSeq` | Non-negative decimal integer, bounded to signed 64-bit range; default `0`; service checks before query | Implemented. Query binds team and cursor and orders ascending by sequence. |
| SSE stream cursor | `afterSequence`, `lastSequence`, or `Last-Event-ID`; non-negative decimal and signed 64-bit bound in controller/feed | Implemented; malformed cursors return 400 before opening a stream. |
| Audit filters `action`, `actorId` | Optional strings are trimmed and parameterized by the service; no DTO/decorator length or format validation | Parameterized and team-scoped, but no explicit format/length contract exists. |
| Path identifiers | `ParseUUIDPipe` on `:id`, `:invitationId`, and `:connectionId` path parameters | Implemented where those parameters occur. |

## 3. Tests

Executed together on the current worktree:

```text
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

(node:14200) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        2.952 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

The mocked suites cover DTO/service validation, live-role guard decisions, team-scoped queries, invitation binding and acceptance, audit/activity transaction assertions, an end-to-end mocked state thread, stream replay/revocation/heartbeat/pong, and ordered cursor behavior. `src/teams/teams.collaboration.spec.ts` is the database-backed integration suite and was **NOT EXECUTED**: `Test-NetConnection` to `127.0.0.1:5432` returned `False`. No migration was applied and no live integration result is claimed.

## 4. Secrets and Sensitive Data

- A credential-literal assignment scan of `src/teams/**/*.ts` found no candidate hardcoded API-key, JWT-secret, password, database-URL, or access-token assignments. The scan emitted no source lines or values.
- A source search found no `console`, logger, `logError`, or `logRequest` calls under `src/teams/`; no runtime team-service log output was produced by the mocked suite. Raw `.env` contents were not read or printed.
- `TeamsService.createInvitation` generates a 32-byte random token and stores only its SHA-256 hash; the raw token is returned once in the create response. The acceptance path hashes the presented token before lookup.
- Environment/config usage is externalized: `auth.module.ts` reads `JWT_SECRET`; `prisma7.config.ts` reads `DATABASE_URL`; `prisma7.test.config.ts` requires `TEST_DATABASE_URL` and rejects database names other than `url_shortener_test`. The `.env` file is git-ignored (`git check-ignore .env` returned `.env`).
- **Sensitive-data finding:** invitation creation writes normalized `invitedEmail` into audit metadata. The audit response redactor filters keys named for tokens/secrets/passwords/authorization/credentials/API keys, but does not redact `invitedEmail`. Audit access is role-restricted to OWNER/ADMIN; retention and privacy treatment of that email still need an explicit policy. No raw invite token is written to audit metadata or logs.

## 5. Documentation Accuracy

Static cross-checks were made against `teams.controller.ts`, `teams.service.ts`, the DTO files, `team-role.guard.ts`, and `team-activity-feed.service.ts`. This is not a substitute for making live requests.

| Documented endpoint | Source comparison | Result |
|---|---|---|
| `POST /teams` | Controller uses `JwtAuthGuard`; `CreateTeamDto` is name string/non-empty/max 100; service trims and returns the created row with id/name/timestamps after OWNER, audit, and activity writes | Static match. No live HTTP request executed. |
| `POST /teams/:id/invitations` | OWNER/ADMIN route guard; DTO requires email, `inviteeUserId`, and optional ADMIN/MEMBER; service returns invitation metadata plus token, stores hash, and writes audit/activity | Static match. No live HTTP request executed. |
| `POST /teams/:id/comments` | Member-role route guard; DTO body max 5000; service trims, resolves only same-team member mentions, writes comment/audit/activity transactionally, then publishes | Static match. No live HTTP request executed. |
| `GET /teams/:id/audit-logs` | OWNER/ADMIN guard; optional action/actor filters; service is team-scoped, descending, and returns the documented audit fields after key-based metadata redaction | Static match, with the `invitedEmail` exposure noted above. No live HTTP request executed. |

The docs correctly describe the activity stream as SSE, not WebSockets. REST activity rows expose `targetType`, `targetId`, and `metadata`; SSE business event data uses `payload` and omits the two target fields. Example bodies and success response fields were compared to controller/DTO/service shapes. Because PostgreSQL is unavailable, no documented API example was sent to a live server and no actual HTTP response was compared.

## 6. CI

| Item | Current evidence | Status |
|---|---|---|
| Focused mocked tests | 2 suites / 22 tests passed above | PASS locally |
| Nest compile/build | `node ./node_modules/@nestjs/cli/bin/nest.js build` exited 0 with no output | PASS locally |
| Whitespace/diff validation | `git diff --check` exited 0; Git emitted the CRLF warning below | PASS locally |
| Live DB integration | PostgreSQL probe returned `False` | NOT EXECUTED |
| Current-code CI run | No CI run URL/log was available in this workspace | NOT VERIFIED |
| Committed CI workflow | No workflow file was added by the prior BUILD task; its CI document is a proposed sequence, not a running pipeline | PENDING |

Exact build and diff outputs:

```text
node ./node_modules/@nestjs/cli/bin/nest.js build
<no stdout/stderr; exit code 0>

git diff --check
warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
<exit code 0>
```

## 7. Rollback Plan

**Current status:** This is a proposed operational procedure, not an existing or exercised deployment runbook. No deployment platform, prior artifact identifier, feature flag, on-call roster, or measured rollback duration was available in the inspected files.

1. The service on-call declares the incident, stops further rollout, captures request IDs and relevant application/database evidence, and alerts the incident commander and Team Collaboration service owner. If the incident involves unauthorized access or exposed invite-email data, also notify the Security/Privacy lead and Product owner.
2. If the new application release is the cause, route traffic back to the previously approved application artifact using the deployment platform's reviewed rollback procedure. **Planning target to validate:** restore the previous healthy application version within 15 minutes of the rollback decision. The target is not measured or guaranteed here; the deployment owner must run a rollback drill and record the actual duration before production sign-off.
3. Do not assume application rollback undoes database migrations. Inspected Team Collaboration migration SQL creates the role/status enums and tables/indexes/constraints, then adds recipient binding, activity sequencing/events, and comments; no down-migration scripts were found in those migration directories. Dropping these objects could destroy data. Keep the additive schema and prefer a backward-compatible forward fix unless a separately reviewed recovery plan proves a safe database action is required.
4. Before any migration or integration test, verify the selected database privately. `prisma7.test.config.ts` and the Prisma test service require `TEST_DATABASE_URL` to name exactly `url_shortener_test`; `prisma7.config.ts` uses `DATABASE_URL` without that test-name guard. Never point either setting at production or a shared database.
5. The deployment owner posts status to the incident channel and notifies the affected product/team owner. The incident commander provides stakeholder updates; Security/Privacy handles any required privacy response. Capture the rollback outcome and follow up with a forward fix and a post-incident review.

**Readiness decision:** The source audit, focused mocked tests, build, and diff check pass. The feature is **not fully signed off for production**: live database/HTTP verification, migration application against the guarded test database, current CI execution/workflow evidence, three real endpoint spot checks, and a rollback drill remain pending.
