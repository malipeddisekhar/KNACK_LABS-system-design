# Module 06 — BREAK: Interface Mismatch

## Diagnosis

An HTTP path describes the transport request, not necessarily the domain event or all state changes it causes. A middleware rule that infers meaning from a URL can mislabel nested mutations, miss a domain event produced after a transaction commits, or overlook that an event is emitted to a team-scoped subscription the relevant client never joined. Conversely, a service may successfully perform its local operation while a separately implemented consumer expects a different event name, payload, or subscription.

This is why isolated feature checks can pass while cross-feature behavior fails: each component may satisfy its own mocked interface, but the route, authorization guard, transaction, audit writer, event publisher, and subscriber can disagree at their boundaries. A successful HTTP response alone does not prove that every domain event was recorded or delivered.

The current LinkOps team feed does not use a general external event bus. TeamsService calls TeamActivityFeedService.publish after the database transaction resolves; the feed keeps subscribers in process-local, team-scoped maps. The event-bus example is a general failure pattern, while the concrete local risks here are route-to-event mismatch, subscriber authorization/scope, different REST and SSE payload contracts, and the lack of cross-instance fan-out.

## Evidence from the Existing Team Implementation

### Invitation creation

TeamsService.createInvitation performs its invitation work inside one Prisma transaction. It inserts the pending invitation, inserts an AuditLog action TEAM_INVITATION_CREATED, increments the team activity sequence and inserts the corresponding ActivityEvent; after the transaction resolves, it calls activityFeed.publish. The audit metadata includes invited email and role, while the ActivityEvent payload contains role. This is evidence from the implementation, not a live database write in this BREAK step.

### Comment creation

TeamsService.createComment checks that the author is a member, resolves unique @principalId candidates against members of that same team, inserts the TeamComment and inserts TEAM_COMMENT_CREATED ActivityEvent in the transaction. It publishes that event after commit. The method does not insert an AuditLog row, so comment activity and audit history are not currently equivalent or complete mirrors.

### REST versus SSE event shape

GET /teams/:id/activity returns persisted rows with id, sequence, actorId, type, targetType, targetId, metadata, and createdAt. SSE streams a TeamActivityEvent with teamId, sequence, type, actorId, payload, and createdAt; targetType and targetId are omitted from SSE data, and metadata is renamed to payload. Therefore a client listening only to SSE cannot directly identify a target comment or invitation from those omitted fields. A path-based middleware log cannot fill that domain-contract gap.

The feed requires team authorization and maintains subscribers locally. Even if each service instance passes unit tests, a mutation committed on one API instance will not publish to subscribers held only in another instance unless shared fan-out is added. No shared pub/sub transport is configured by this implementation.

## Verification Boundary

The two existing mocked suites were run together:

    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

Output:

    (node:16724) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use node --trace-warnings ... to show where the warning was created)

    Test Suites: 2 passed, 2 total
    Tests:       9 passed, 9 total
    Snapshots:   0 total
    Time:        3.405 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
    Exit code: 0

Nest build:

    node ./node_modules/@nestjs/cli/bin/nest.js build

Output was empty; exit code: 0.

Diff check:

    git diff --check

Output:

    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it

Exit code: 0.

PostgreSQL reachability:

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

Output:

    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

These unit tests use mocked Prisma/feed/auth dependencies and in-memory subscribers. The collaboration HTTP integration spec, live PostgreSQL mutations, live REST/SSE requests, and cross-instance delivery were NOT EXECUTED because the PostgreSQL port check returned False. No migration was applied.

## UPSK Reachability and Advancement

The read-only status command was:

    "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to status --json

It returned:

    {"timestamp_unix_ms":1795363852691,"level":"error","message":"command.failed","context":{"command":"status"}}
    Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"

The independent health probe returned: curl: (6) Could not resolve host: api.upsk.to. CLI version was upsk 0.1.30; the status timestamp is 2026-11-22 16:10:52.691 UTC. Local last_error.json was last written at 2026-11-22 15:42:22 UTC and contains an older Module 5 report-payload read error without trace IDs; it does not describe the current DNS failure. No advancement command was attempted.

Ready-to-run PowerShell advancement command after connectivity returns:

    & "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to next --summary "Completed Module 06 BREAK by tracing the HTTP-path versus domain-event mismatch and documenting invitation audit/activity atomicity, comment audit omission, REST/SSE shape differences, mocked verification, and the live database boundary." --evidence "progress\ai-augmented-engineering\module-06\interface-mismatch-break.md"

