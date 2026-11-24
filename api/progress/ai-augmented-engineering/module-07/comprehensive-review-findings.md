# Module 07 — Comprehensive Security and Architecture Review

**Review date:** 2026-11-22
**Scope:** Read-only review of `src/teams/`, team DTOs, guards, activity-feed service and team specs, `prisma/schema.prisma`, common error handling, validation bootstrap, and package metadata.

## Review Boundary

This is a source, schema, and mocked-test review. No application source, Prisma schema/migration, package manifest, or team implementation file was edited for this review. Targeted mocked Jest suites and the Nest build pass, but PostgreSQL reachability returned `False`; live PostgreSQL/HTTP behavior, applied migrations, and database-backed integration cases remain **NOT EXECUTED**.

The relevant persisted contracts include Team, TeamMember, TeamInvitation, AuditLog, ActivityEvent, and TeamComment. Team membership has a unique team/user pair; pending invitations have a partial team/email uniqueness constraint and a seven-day default expiry; activity events have a unique per-team sequence. These schema constraints support the source-level conclusions below but have not been verified against a running database in this step.

## Security Review

### Auth Check Audit

| ENDPOINT | AUTH CHECK | AUTHORIZATION CHECK | STATUS |
|---|---|---|---|
| POST /teams | JwtAuthGuard; CurrentPrincipal | Creator membership is written as OWNER in the creation transaction | OK |
| POST /teams/invitations/accept | JwtAuthGuard; CurrentPrincipal | Service checks stored recipientUserId against principalId and invitation state | REVIEW — nullable recipient IDs are accepted at creation but fail closed at acceptance; see finding F-03 |
| POST /teams/:id/invitations | JwtAuthGuard + TeamRoleGuard through RequireTeamRoles | Live team_members lookup requires OWNER or ADMIN | OK |
| DELETE /teams/:id/invitations/:invitationId | JwtAuthGuard + TeamRoleGuard | Live OWNER/ADMIN check; mutation selects invitation by both invitationId and teamId | OK |
| GET /teams/:id/activity | JwtAuthGuard + TeamRoleGuard | Live membership allows OWNER, ADMIN, MEMBER; query is team-scoped | OK |
| GET /teams/:id/activity/stream | JwtAuthGuard + TeamRoleGuard at connection setup | Live membership check at handshake; existing stream is not reauthorized after role change | REVIEW — see finding F-01 |
| POST /teams/:id/activity/stream/:connectionId/pong | JwtAuthGuard + TeamRoleGuard | Feed checks connection ID, team ID, and principal ID | OK |
| POST /teams/:id/comments | JwtAuthGuard + TeamRoleGuard; service also checks author membership in transaction | Active team membership; mention lookup is scoped to the same team | REVIEW — auth is present, but DTO validation likely prevents valid HTTP bodies; see F-02 |
| GET /teams/:id/comments | JwtAuthGuard + TeamRoleGuard | Live membership; comments query is team-scoped | OK |
| GET /teams/:id/audit-logs | JwtAuthGuard + TeamRoleGuard | Live OWNER/ADMIN check; query is team-scoped | OK |

TeamRoleGuard uses a parameterized Prisma.sql query against team_members with team UUID and request.user.principalId. The controller applies ParseUUIDPipe to team and invitation IDs where those IDs occur in the route. This is source-level evidence, not proof of database-backed authorization under live load.

### Input Validation Audit

| ENDPOINT | INPUT FIELD | VALIDATION | STATUS |
|---|---|---|---|
| POST /teams | name | DTO requires string/non-empty and max 100; service trims and rejects whitespace-only | OK |
| POST /teams/:id/invitations | invitedEmail | IsEmail and max 254; service trims and lowercases | OK |
| POST /teams/:id/invitations | role | Optional; restricted to ADMIN or MEMBER | OK |
| POST /teams/:id/invitations | inviteeUserId | Optional string, non-empty, max 128; no UUID rule, consistent with text principal IDs | REVIEW — optional null/missing recipient cannot accept the invitation; see F-03 |
| POST /teams/invitations/accept | token | String, non-empty, max 128; service hashes token before lookup | OK |
| POST /teams/:id/comments | body | CreateTeamCommentDto declares body but has no class-validator decorators; service checks string/nonblank but not length | CRITICAL — global whitelist/forbidNonWhitelisted pipe can reject body before controller; see F-02 |
| GET /teams/:id/activity | afterSeq | Service checks non-negative integer syntax and signed 64-bit maximum | OK — no page-size cap |
| GET /teams/:id/activity/stream | afterSequence, lastSequence, Last-Event-ID | Controller checks decimal cursor syntax and signed 64-bit maximum | OK |
| GET /teams/:id/audit-logs | action, actorId | Optional strings are trimmed and parameterized in SQL; no explicit length limits | REVIEW — add bounded input and result pagination |
| DELETE /teams/:id/invitations/:invitationId; POST pong | teamId, invitationId, connectionId | ParseUUIDPipe on route IDs | OK |

The global ValidationPipe in src/app.module.ts enables whitelist, forbidNonWhitelisted, and transform. Since CreateTeamCommentDto has no validation metadata for body, the HTTP request shape expected by the integration spec is likely rejected before TeamsController; this is a source-based finding and was not confirmed with a live HTTP request.

### IDOR and Ownership Check

| ENDPOINT | RESOURCE ID | OWNERSHIP CHECK | STATUS |
|---|---|---|---|
| POST /teams | None | Authenticated creator becomes OWNER atomically | OK |
| POST /teams/:id/invitations | Team ID | Live role guard checks caller membership and OWNER/ADMIN role for that team | OK |
| DELETE /teams/:id/invitations/:invitationId | Team and invitation IDs | Role guard scopes caller to team; service row lookup includes both IDs | OK |
| POST /teams/invitations/accept | Hashed token | Recipient principal must match stored recipientUserId; state and expiry checked under row lock | REVIEW — invitation may be created without recipientUserId and then cannot be accepted |
| GET /teams/:id/activity | Team ID and cursor | Live membership guard; SQL filters by team ID | OK |
| GET /teams/:id/activity/stream | Team ID | Live membership guard at handshake; principal/team binding on connection; no continuing membership revocation check | REVIEW — an existing stream can outlive demotion |
| POST /teams/:id/activity/stream/:connectionId/pong | Team and connection IDs | Role guard plus feed comparison of team and principal IDs | OK |
| POST /teams/:id/comments | Team ID | Role guard and in-transaction author membership query; mentions resolve only among that team's members | OK — HTTP DTO boundary needs repair |
| GET /teams/:id/comments | Team ID | Live membership guard; query filters by team ID | OK |
| GET /teams/:id/audit-logs | Team ID | Live OWNER/ADMIN guard; query filters by team ID | OK |

All reviewed raw SQL values are parameterized through Prisma.sql/Prisma.join. No interpolated client string is concatenated into a SQL statement in these paths.

### Secrets and Sensitive Data Audit

- No production credential, API key, or hard-coded service secret was found in the reviewed team implementation or schema. Invitation creation generates a 32-byte random token, stores its SHA-256 hash, and returns the raw token in the create response; the service does not log it.
- The integration spec contains fixed development fixture credentials for its local Alice/Bob accounts. They appear to be test-only values, not production secrets, but the test database/configuration must keep them isolated.
- Invitation audit metadata stores invitedEmail and role. The recursive redactor filters keys matching token, secret, password, authorization, credential, and api-key patterns; invitedEmail does not match and therefore remains visible to OWNER/ADMIN audit readers. Treat this as an explicit PII retention/access decision, not as covered by the current redactor.
- Team comment text and mention principal IDs are persisted. The comment audit stores mentionCount rather than body, and the activity event also contains mentionCount rather than comment content.
- HttpExceptionFilter does not send stack traces to clients and returns a generic message for unexpected 5xx errors. It logs the exception message internally without a stack; confirm logger access/retention because downstream exception text can contain implementation details.

### Dependency Audit

package.json has no diff in this review, and no dependencies were added by this review pass. Existing dependencies include Nest, Prisma, class-validator, and RxJS, which are already used by the reviewed implementation. `npm audit` was **NOT RUN**; the UPSK host also failed DNS resolution during this step, so no live dependency advisory check is claimed.

## Architecture Review

### Pattern Consistency

TeamsController owns route mapping and delegates to TeamsService. RequireTeamRoles composes JWT authentication with a live TeamRoleGuard query. TeamsService uses parameterized raw SQL inside Prisma transactions for mutation, audit, and ordered activity writes, then calls TeamActivityFeedService.publish after the transaction callback resolves. This gives the mutation paths a consistent post-commit publication boundary.

### Naming Consistency

Feature files and DTOs are grouped under src/teams and use Team-prefixed DTO/model names. The schema defines TeamRole while team-role.guard.ts maintains a separate string-union TeamRole; these currently match but could drift. API routes use `:id` for teamId while the guard supports both id and teamId parameter names, which is consistent in behavior but less explicit than naming the parameter teamId.

### Error Handling Consistency

Services use Nest exceptions for invalid input, forbidden access, missing resources, conflicts, and expired invitations. The global exception filter maps these statuses into the shared error envelope and does not expose stacks to clients. There is no route-level test in the executed mocked suites proving the final HTTP status/envelope and X-Request-ID behavior for these team paths.

### Test Coverage Map

| AREA | UNIT TESTS | INTEGRATION TESTS | AUTH TESTS | EDGE CASES | CRITICAL GAP |
|---|---|---|---|---|---|
| Feed lifecycle | 6 mocked tests in team-activity-feed.spec.ts: authorization setup, delivery, 1/2/3 stream, disconnect, replay, heartbeat timeout | teams.collaboration.spec.ts includes REST activity cursor assertions but was not run | Mock JWT and TeamRoleGuard path | Cursor replay, heartbeat, missed pong, disconnect cleanup | No live SSE/HTTP or multi-instance delivery proof |
| Comment mutations | 1 mocked contract test for active-member mention filtering and transactional audit/activity ordering | Integration spec covers nonmember denial, blank body, create/list, and mentions; NOT EXECUTED | Guard behavior is mocked separately | Invalid/nonmember mention excluded in mock | DTO lacks validators; no executed HTTP test establishes body acceptance |
| Invitation lifecycle | 1 mocked creation audit/activity contract; acceptance/revoke lifecycle not in targeted unit suites | Integration spec covers duplicate, wrong recipient, accept/replay, expiry, revoke; NOT EXECUTED | Role guard mock covers member/nonmember denial | Replay/expiry cases exist only in unrun DB integration spec | Missing-recipient creation behavior has no test |
| Audit query | No direct mocked query/filter/redaction test in the targeted suites | Integration spec checks owner/admin access, denial, fields, and token absence; NOT EXECUTED | Guard mock covers insufficient roles, not audit route | No PII redaction assertion for invitedEmail | No live HTTP, pagination, or metadata-policy verification |
| Team creation | Unit feed spec uses create() to assert post-commit publication | Integration spec asserts OWNER membership; NOT EXECUTED | JWT/role behavior partly unit-mocked | Whitespace service behavior not integration-run | No live transaction/audit/member proof |

The requested combined Jest run covers 2 mocked suites and 9 tests. The database-backed team collaboration spec was inspected but not run because localhost:5432 is unreachable; therefore no runtime result is inferred from its expectations.

## Prioritized Findings List

### F-01 — Existing stream can outlive membership demotion

- **Severity:** High
- **Category:** Security
- **Description:** The SSE route checks membership when the stream is opened, but TeamActivityFeedService retains the connection and publishes team events without rechecking current membership. The pong route checks membership when called, but a client can simply continue receiving the open stream after losing its role.
- **Evidence:** src/teams/teams.controller.ts:44-57; src/teams/team-role.guard.ts:36-58; src/teams/team-activity-feed.service.ts:46-73, 130-149.
- **Impact:** A removed or demoted member may continue receiving sensitive team activity until the stream disconnects or times out.
- **Fix plan:** Revalidate authorization on a bounded interval or on every publication, and close/revoke affected connections when membership changes; test role demotion during an open stream.

### F-02 — Comment request DTO lacks validation metadata

- **Severity:** High
- **Category:** Architecture
- **Description:** CreateTeamCommentDto declares body without class-validator decorators while the app-wide pipe enables whitelist and forbidNonWhitelisted. The HTTP body property can be treated as non-whitelisted and rejected before the controller; service-level checks do not prove the route accepts valid requests.
- **Evidence:** src/teams/dto/create-team-comment.dto.ts:1-2; src/app.module.ts:116-121; src/teams/teams.controller.ts:71-79; src/teams/teams.collaboration.spec.ts:63-66 (expected HTTP behavior only; test not executed).
- **Impact:** Comment creation can fail for every normal HTTP request, and the unbounded text field lacks a length contract.
- **Fix plan:** Add explicit string, non-empty, and maximum-length validation to body; retain trimmed service validation and add HTTP tests for valid, blank, non-string, and over-limit bodies.

### F-03 — Recipient-optional invitations are not accept-able

- **Severity:** High
- **Category:** Data Integrity
- **Description:** CreateTeamInvitationDto makes inviteeUserId optional, and createInvitation stores null if omitted. acceptInvitation explicitly rejects invitations with null recipientUserId, so email-only invitations can be created and delivered but never accepted.
- **Evidence:** src/teams/dto/create-team-invitation.dto.ts:8-16; src/teams/teams.service.ts:82-93, 153-155; prisma/schema.prisma:74-80.
- **Impact:** The API can report successful invitation creation for an invitation whose acceptance is impossible, leaving orphaned pending invitations and confusing users.
- **Fix plan:** Define a supported identity contract: require inviteeUserId until a trusted email-to-principal lookup exists, or implement verified recipient binding; add a test for omitted recipient and successful intended-recipient acceptance.

### F-04 — Invitation email remains visible in audit responses

- **Severity:** Medium
- **Category:** Security
- **Description:** Invitation creation records invitedEmail in AuditLog metadata, and the metadata redactor does not classify that key as sensitive. OWNER/ADMIN audit readers receive that metadata.
- **Evidence:** src/teams/teams.service.ts:97-101, 254-274; src/teams/teams.controller.ts:87-95.
- **Impact:** Personal data may be exposed beyond the operational need or retained longer than policy permits.
- **Fix plan:** Have Product/Security define audit necessity and retention; mask or omit email from read responses where possible, enforce retention/access controls, and test the chosen privacy rule.

### F-05 — Unbounded list and replay work can exhaust resources

- **Severity:** Medium
- **Category:** Data Integrity
- **Description:** Activity, comments, and audit queries have no page limit. SSE replay loads every event after the cursor, and replayBuffer can grow while replay is in progress.
- **Evidence:** src/teams/teams.service.ts:196-206, 247-265; src/teams/team-activity-feed.service.ts:39-40, 67-73, 84-97.
- **Impact:** Large teams or old cursors can cause long queries, high memory use, slow responses, or process pressure.
- **Fix plan:** Add bounded pagination/replay windows and backpressure or bounded buffering with an explicit reset/resync response; load-test representative large histories.

### F-06 — REST and SSE activity event shapes are not identical

- **Severity:** Medium
- **Category:** Architecture
- **Description:** REST listActivity returns id, targetType, targetId, and metadata. SSE events expose teamId, sequence, type, actorId, payload, and createdAt; targetType/targetId are omitted and metadata is renamed payload.
- **Evidence:** src/teams/teams.service.ts:201-205, 286-300; src/teams/team-activity-feed.service.ts:9-16, 99-103, 115.
- **Impact:** Clients switching between initial REST load and live SSE may lack resource identity or require undocumented adapters.
- **Fix plan:** Publish a shared event contract and either align the DTOs or document/test intentional differences and client reconciliation behavior.

### F-07 — Critical lifecycle and HTTP claims lack executed DB integration proof

- **Severity:** Medium
- **Category:** Test Coverage
- **Description:** Targeted mocked tests pass, but the integration spec exercises actual auth, transactions, comments, invitation expiry/replay, and audit authorization against PostgreSQL and was not executed. There is no live runtime proof for schema/migration compatibility in this step.
- **Evidence:** src/teams/teams.collaboration.spec.ts:8-73; Test-NetConnection to 127.0.0.1:5432 returned False.
- **Impact:** Mock behavior can diverge from Postgres constraints, transaction semantics, global validation, and real HTTP serialization.
- **Fix plan:** Restore the isolated url_shortener_test database, apply pending migrations there, run the integration spec and route-level DTO/error-envelope tests, and record exact results. Do not target a non-test database.

### F-08 — Test fixture credentials are fixed literals

- **Severity:** Low
- **Category:** Security
- **Description:** The integration spec uses fixed Alice/Bob development passwords. They look like local fixtures rather than production credentials, but are embedded in source.
- **Evidence:** src/teams/teams.collaboration.spec.ts:20-22.
- **Impact:** If fixture credentials are reused in a shared or production-like environment, they can weaken test isolation.
- **Fix plan:** Keep fixture users confined to an isolated test database and consider provisioning test credentials through test setup rather than checked-in literal strings.

### F-09 — Role type duplicates schema enum

- **Severity:** Low
- **Category:** Architecture
- **Description:** The guard defines its own OWNER/ADMIN/MEMBER string union instead of deriving from the generated Prisma TeamRole type.
- **Evidence:** src/teams/team-role.guard.ts:17; prisma/schema.prisma:11-15.
- **Impact:** Future schema role changes could leave the authorization type stale or inconsistent.
- **Fix plan:** Use a generated enum/type or add a compile-time parity test so policy and persistence cannot drift.

## Verification Record

The following checks were run in this review pass:

    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
    (node:13692) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    Test Suites: 2 passed, 2 total
    Tests:       9 passed, 9 total
    Snapshots:   0 total
    Time:        4.063 s
    EXIT_CODE=0

    node ./node_modules/@nestjs/cli/bin/nest.js build
    EXIT_CODE=0

    git diff --check
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
    EXIT_CODE=0

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

Therefore live PostgreSQL/HTTP checks, migrations, and database-backed integration tests remain **NOT EXECUTED**. `npm audit` also remains **NOT RUN**.

UPSK status failed at timestamp_unix_ms 1795365457499 (2026-11-22 16:37:37.499 UTC). Exact status output:

    {"timestamp_unix_ms":1795365457499,"level":"error","message":"command.failed","context":{"command":"status"}}
    Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"

The independent health probe returned `curl: (6) Could not resolve host: api.upsk.to`; this confirms this environment could not resolve the host, not that the service is down for everyone. CLI version was upsk 0.1.30; diagnostic clock read 2026-11-22 16:39:44.153 UTC. The local last_error.json was last modified at 2026-11-22 15:42:22 UTC and contains an older report-payload read failure for Module 5, not this network attempt; no trace/correlation/request IDs were present. No `upsk next` was attempted. After reachability returns, the exact ready-to-run PowerShell command is:

    & "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to next --summary "Completed Module 07 BUILD security and architecture review with source-grounded auth, validation, IDOR, sensitive-data, architecture, and test-coverage findings; mocked suites passed 9/9 and Nest build passed, while PostgreSQL-backed HTTP checks remain NOT EXECUTED." --evidence "progress\ai-augmented-engineering\module-07\comprehensive-review-findings.md"
