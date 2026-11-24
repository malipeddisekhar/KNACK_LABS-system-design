# Module 06 — Parallel Sprint Contracts and Log

## Scope and Coordination

Three parallel, read-only contract reviews were assigned distinct domains: comments/@mentions, audit records, and activity feed/stream lifecycle. Each returned source-grounded interfaces and merge risks; none edited application files. The coordinator then integrated one new self-contained contract spec, with separate test cases for each invariant. This keeps the shared production files single-owner and avoids representing analysis as parallel code changes.

The existing implementation centralizes routes and writes in teams.controller.ts and teams.service.ts. Those files, teams.module.ts, prisma/schema.prisma, and migration ordering are merge hotspots. The batch therefore treats existing model and route signatures as frozen; schema, package metadata, and existing team files are read-only. No new package or migration is part of this batch.

## Agent 1 — Comment Threads and @Member Mentions

- **CREATES:** Read-only comment-contract findings and a specification for the comment/mention invariant; the coordinator then implemented that case in team-collaboration-contracts.spec.ts. Current code has comment creation/listing, not threads/replies.
- **READS (do not modify):** src/teams/teams.controller.ts, src/teams/teams.service.ts, src/teams/dto/create-team-comment.dto.ts, src/teams/team-role.guard.ts, prisma/schema.prisma, src/common validation setup.
- **MODIFIES:** No existing application file, Prisma model, package file, or migration. In this pass the coordinator owns the single new spec file.
- **DATA SHAPES:** Principal is { principalId, username }. TeamComment is { id, teamId, authorId, body, mentions: string[], createdAt }; mentions are JSONB in team_comments. Syntax is @<principalId>; candidates are deduplicated and only exact current team members of the same team are stored. The service trims body and rejects blank input.
- **AUTH/GUARDS:** POST and GET /teams/:id/comments parse id as UUID and allow OWNER, ADMIN, or MEMBER through JwtAuthGuard plus live TeamRoleGuard lookup by teamId and principalId. The service rechecks the author membership during creation.
- **EVENTS EMITTED/CONSUMED:** Creation inserts a TEAM_COMMENT_CREATED ActivityEvent with target TEAM_COMMENT/comment ID and payload metadata { mentionCount } in the same transaction; the typed event is published after commit. Current comment creation does not write an AuditLog row.
- **Cross-agent wiring/integration gaps:** CreateTeamCommentDto declares body without class-validator decorators while the app's global ValidationPipe uses whitelist and forbidNonWhitelisted. Service-level tests do not prove HTTP POST passes DTO validation. There is no thread parent/reply model, pagination, edit/delete, or mention-notification path. REST activity returns targetType/targetId/metadata, while SSE omits target identifiers and renames metadata to payload.

## Agent 2 — Audit Log Query and Atomic Recording

- **CREATES:** Read-only audit-contract findings and a specification for the atomic-recording invariant; the coordinator then implemented that case in team-collaboration-contracts.spec.ts. No audit source code was changed in this batch.
- **READS (do not modify):** prisma/schema.prisma, src/teams/teams.controller.ts, src/teams/teams.service.ts, src/teams/team-role.guard.ts, existing collaboration tests.
- **MODIFIES:** No existing controller, service, guard, schema, package file, or migration; coordinator owns the new spec file.
- **DATA SHAPES:** AuditLog includes id, teamId, actorId, action, targetType, targetId, outcome, nullable metadata, and createdAt. It is indexed by (teamId, createdAt) and actorId. Query output is ordered by createdAt descending then id descending, with optional exact action/actorId filters; sensitive metadata keys are recursively redacted.
- **AUTH/GUARDS:** GET /teams/:id/audit-logs uses ParseUUIDPipe and live RequireTeamRoles('OWNER','ADMIN'); MEMBER and non-member access are denied.
- **EVENTS EMITTED/CONSUMED:** Team creation and invitation create/accept/revoke persist audit rows in the same Prisma transaction as the associated mutation and ActivityEvent. Invitation create uses TEAM_INVITATION_CREATED for both audit action and activity type; the audit metadata contains email/role while the activity payload contains role only. Comments currently emit activity but no audit row.
- **Cross-agent wiring/integration gaps:** No pagination is implemented for audit reads. Failed invite/revoke/accept attempts and expiry transitions are not audit-recorded. Keep audit metadata redaction and transactional writes distinct from activity-feed payloads; they serve different readers and privacy needs.

## Agent 3 — Real-Time Activity Feed and Stream Lifecycle

- **CREATES:** Read-only activity/stream contract findings and a specification for the mocked role-rejection invariant; the coordinator then implemented that case in team-collaboration-contracts.spec.ts. No feed implementation was changed in this batch.
- **READS (do not modify):** src/teams/team-activity-feed.service.ts, src/teams/teams.controller.ts, src/teams/teams.service.ts, src/teams/team-role.guard.ts, src/teams/team-activity-feed.spec.ts, prisma/schema.prisma.
- **MODIFIES:** No existing activity service, controller, service, schema, package file, or migration; coordinator owns the new spec file.
- **DATA SHAPES:** ActivityEvent persists id, teamId, sequence, actorId, type, targetType, targetId, metadata, and createdAt; (teamId, sequence) is unique. REST cursor is afterSeq and returns sequence-ordered rows above the cursor. SSE accepts afterSequence, lastSequence, or Last-Event-ID and emits typed events with sequence as a decimal string, payload, actorId, teamId, and ISO createdAt.
- **AUTH/GUARDS:** Activity history, SSE, and pong use JwtAuthGuard plus live team membership for OWNER/ADMIN/MEMBER. Pong also checks connection ID, team ID, and principal ID.
- **EVENTS EMITTED/CONSUMED:** Mutation transactions increment teams.activity_sequence and insert ActivityEvent; TeamsService calls publish only after transaction commit. The stream replays persisted rows, buffers live events for contiguous sequence delivery, sends 15-second pings, and removes connections after missed acknowledgements at 45 seconds.
- **Cross-agent wiring/integration gaps:** Subscriber fan-out is process-local; horizontal instances need shared pub/sub. Browser EventSource cannot set the required Bearer header, so browser clients need a fetch-stream/polyfill or an explicitly approved auth transport. REST and SSE cursor names/shapes differ, and live SSE omits targetType/targetId.

## Explicit Shared Contracts and Integration Gates

1. Freeze existing schema keys and migration history before any concurrent persistence work: Team.activitySequence; TeamMember(teamId,userId,role); TeamInvitation recipient/status/expiry fields; TeamComment body/mentions; AuditLog fields; ActivityEvent unique (teamId,sequence).
2. Freeze identity and authorization: Principal { principalId, username }; TeamMember.userId is compared to principalId; RequireTeamRoles uses the current database role, not a token role.
3. Keep mutations, related AuditLog/ActivityEvent writes, and sequence increments in one transaction. Publish the event only after commit.
4. Keep a single integration owner for teams.controller.ts, teams.service.ts, teams.module.ts, schema changes, and migration ordering. Domain reviewers/tests may run in parallel only with distinct file/test ownership and frozen DTO/event/error contracts.
5. Before an HTTP claim, verify DTO validation and guards through endpoint-level tests; before a database claim, run only against the guarded url_shortener_test database. Mocks establish only their stated unit invariants.

## Verification Boundary and Exact Results

The new spec uses mocked Prisma transaction clients, a mocked feed publisher, and a synthetic Principal; it does not issue SQL to PostgreSQL or send HTTP requests. Jest still loads test/setup-test-db.ts, which validates that TEST_DATABASE_URL targets url_shortener_test but does not connect to the database. The separate TCP reachability result is recorded below; while it is False, live PostgreSQL and HTTP checks are NOT EXECUTED.

Verification commands and exact output are appended below after the focused suite, Nest build, diff check, and TCP check.



## Final Verification Results

The focused Jest command was:
    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

Final exact output:
    (node:13076) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use node --trace-warnings ... to show where the warning was created)
    Test Suites: 2 passed, 2 total
    Tests:       9 passed, 9 total
    Snapshots:   0 total
    Time:        2.873 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
    JEST_EXIT=0

The first run of the new contract spec had 1 failed test and 8 passed because the assertion searched SQL text for TEAM_INVITATION_CREATED, while Prisma.sql correctly placed the interpolated event type in bound values. The test now checks the INSERT statement and its bound values; the final rerun above passed.

Nest build command:
    node ./node_modules/@nestjs/cli/bin/nest.js build
Output: NEST_BUILD_EXIT=0

Diff check command:
    git diff --check
Output: warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
    DIFF_CHECK_EXIT=0

PostgreSQL reachability command:
    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
Output:
    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False
Thus live PostgreSQL-backed and HTTP verification is NOT EXECUTED. The focused tests use mocked services and did not open a PostgreSQL connection or send HTTP requests.

## UPSK Status and Advancement

Read-only command:
    & 'C:\Users\malip\.local\bin\upsk.exe' --api-url https://api.upsk.to status --json
Exact output:
    {"timestamp_unix_ms":1795362781933,"level":"error","message":"command.failed","context":{"command":"status"}}
    Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"

Independent health probe output: curl: (6) Could not resolve host: api.upsk.to. CLI version: upsk 0.1.30. The status timestamp converts to 2026-11-22 15:53:01.933 UTC. The local last_error.json was last written at 2026-11-22 15:42:22 UTC with an older report-payload read error; it has no current trace IDs and does not describe this DNS failure. No advancement command was attempted.

Ready-to-run advancement command after connectivity returns:
    & "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to next --summary "Completed Module 06 BUILD with three scoped parallel contract reviews and a mocked contract test suite; 2 suites and 9 tests passed, Nest build and diff check passed, and live PostgreSQL/HTTP verification remains NOT EXECUTED because localhost:5432 is unreachable." --evidence "progress\ai-augmented-engineering\module-06\parallel-sprint-contracts-and-log.md"


