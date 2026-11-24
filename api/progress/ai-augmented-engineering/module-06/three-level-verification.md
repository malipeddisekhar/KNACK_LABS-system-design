# Module 06 — Three-Level Verification

## Verification Scope

This review inspected team unit tests, the collaboration integration spec, Prisma team migrations, shared team files, and exported names read-only. The focused mocked suite was run as one combined invocation. The collaboration integration spec was not executed because its beforeAll starts the Nest application and Prisma connection, while PostgreSQL on 127.0.0.1:5432 is unreachable. No migration was applied, and no files under prisma/ or package.json were changed in this VERIFY pass.

## Level 1 — Individual Feature Verification

| Feature | Verified evidence | What remains unverified or absent |
|---|---|---|
| Comments and @principalId mentions | Mocked unit test “creates comments and resolves only active team-member mentions” calls TeamsService.createComment with an active and an outside principal. It checks that lookup SQL is scoped by teamId and candidate IDs, that only the mocked active member is stored, and that comment event publication follows transaction completion. The service trims body and filters mentions against team_members. | The mock does not prove PostgreSQL membership results or an HTTP 201. CreateTeamCommentDto has body without class-validator decorators, while global validation uses whitelist and forbidNonWhitelisted; verify this route contract with an HTTP test when the guarded DB is reachable. No comment edit/delete, thread/reply, or mention-notification endpoints exist in inspected routes. Live DB writes and live HTTP checks are NOT EXECUTED. |
| Audit recording and querying | Mocked test “records invitation audit and activity rows in one transaction before post-commit publish” exercises invitation creation and checks matching TEAM_INVITATION_CREATED audit and activity action/type, plus publication only after the mocked transaction resolves. TeamsService.listAuditLogs supports action/actorId filters, deterministic createdAt/id ordering, and metadata redaction. | Audit query endpoint behavior is present in source and in the integration spec, but the integration spec was NOT EXECUTED. The mock does not validate persisted rows. Comment creation currently emits ActivityEvent but does not write AuditLog. Live DB writes and queries are NOT EXECUTED. |
| Activity feed and stream lifecycle | The combined mocked suite includes six TeamActivityFeedService cases: live-role authorized subscription, typed event delivery after commit, one open subscriber receiving sequences 1/2/3, disconnect/timer cleanup, replay after lastSequence, and heartbeat timeout cleanup. These use mocked Prisma/JWT or in-memory subscribers. | No live PostgreSQL or HTTP SSE, Last-Event-ID, pong, reconnect, or multi-instance fan-out test ran. The subscriber registry is process-local. Do not claim horizontal delivery from these unit tests. |

The collaboration integration spec also contains assertions for team creation, invitation create/accept/revoke/expiry/replay, role authorization, audit querying, comments/mentions, and activity cursor order. It was inspected, but its tests are NOT EXECUTED because beforeAll boots AppModule and uses Prisma against PostgreSQL.

## Level 2 — Cross-Feature Integration

Invitation creation is the integration path covered by the new mocked contract test: within one transaction, TeamsService inserts the pending invitation, inserts its AuditLog record, increments the team activity sequence, and inserts ActivityEvent. The feed publisher is called only after the mocked transaction resolves. The test checks that the audit action and activity type both equal TEAM_INVITATION_CREATED; it does not prove persisted PostgreSQL atomicity.

Comment creation checks that the author is a live team member, resolves @principalId candidates against memberships in the same team, inserts TeamComment, and writes TEAM_COMMENT_CREATED ActivityEvent in the transaction. It publishes the event after commit, but it does not write an AuditLog row. That is a cross-feature audit gap if policy requires all user-visible mutations to be auditable.

REST and SSE contracts are not identical. GET /teams/:id/activity uses afterSeq and returns event id, targetType, targetId, and metadata. SSE accepts afterSequence, lastSequence, or Last-Event-ID and emits payload instead of metadata while omitting event id, targetType, and targetId from the data object (sequence is the SSE id). A live client therefore cannot correlate a comment event to its target using the SSE data shape alone. These differences were inspected in code, not tested through a live HTTP request.

## Level 3 — Conflict Detection

### Shared-file ownership

The current implementation centralizes route definitions in teams.controller.ts, feature mutations and list queries in teams.service.ts, dependency registration in teams.module.ts, and membership authorization in team-role.guard.ts. prisma/schema.prisma is a cross-feature contract for all six models/enums. Any parallel edits to these files can conflict or create mismatched routes, DTOs, transaction behavior, or model fields; assign a single owner per shared file and serialize final wiring.

Read-only git status showed existing worktree changes: prisma/schema.prisma is modified; the five team migration directories and teams.controller.ts, teams.module.ts, teams.service.ts, and team-role.guard.ts are untracked in this workspace. This status is not attribution evidence and was not changed by this VERIFY pass. package.json was not listed as changed.

### Migration sequence inspection

Migration directories are ordered as follows; SQL was inspected but not applied:

1. 20261122120000_team_collaboration_models — TeamRole enum; teams, team_members, and audit_logs tables; membership uniqueness and audit indexes/FKs.
2. 20261122121000_team_invitations — TeamInvitationStatus enum, team_invitations table, token hash uniqueness, pending invite partial uniqueness, expiry indexes, and team FK.
3. 20261122122000_team_invitation_recipient_binding — recipient_user_id column.
4. 20261122123000_team_activity_events — teams.activity_sequence and activity_events table with unique (team_id, sequence) and team FK.
5. 20261122124000_team_comments — team_comments table, team/created_at index, and team FK.

No migration was applied because the local PostgreSQL TCP check returned False. The recorded migration ordering is based on directory names and SQL contents only.

### Symbol and naming collision check

The exported team symbols inspected were RequireTeamRoles, TeamRoleGuard, TeamActivityEvent, TeamActivityFeedService, TeamsController, TeamsModule, TeamsService, and the four DTO classes. No duplicate exported top-level symbol names were found under src/teams. The guard also declares a local TeamRole union that mirrors the Prisma enum values OWNER, ADMIN, and MEMBER; keep that dual definition aligned if role values ever change.

## Combined Commands and Exact Results

Combined mocked unit test command:
    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

Exact output:
    (node:15840) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use node --trace-warnings ... to show where the warning was created)

    Test Suites: 2 passed, 2 total
    Tests:       9 passed, 9 total
    Snapshots:   0 total
    Time:        2.825 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
    JEST_EXIT=0

The database-backed file src/teams/teams.collaboration.spec.ts was NOT EXECUTED. It constructs AppModule and initializes a real PrismaService in beforeAll; with the port check below returning False, executing it would attempt live DB/HTTP behavior contrary to the carried-forward constraint. No full-repository Jest run was attempted.

Nest build command:
    node ./node_modules/@nestjs/cli/bin/nest.js build
Output: NEST_BUILD_EXIT=0

Diff check command:
    git diff --check
Output:
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
    DIFF_CHECK_EXIT=0

PostgreSQL reachability command:
    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
Output:
    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False
Therefore live PostgreSQL and HTTP checks remain NOT EXECUTED.

## UPSK Reachability

Read-only status command:
    & 'C:\Users\malip\.local\bin\upsk.exe' --api-url https://api.upsk.to status --json

Exact output:
    {"timestamp_unix_ms":1795363409396,"level":"error","message":"command.failed","context":{"command":"status"}}
    Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"

Independent health probe output:
    curl: (6) Could not resolve host: api.upsk.to

CLI version was upsk 0.1.30; status timestamp 1795363409396 corresponds to 2026-11-22 16:03:29.396 UTC. The local last_error.json was last written at 2026-11-22 15:42:22 UTC and reports an older Module 5 report-payload read failure with no trace identifiers; it does not describe the current DNS failure. No upsk next command was attempted.

