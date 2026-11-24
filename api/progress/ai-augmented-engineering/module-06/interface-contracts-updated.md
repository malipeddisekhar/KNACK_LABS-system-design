# Module 06 — Updated Interface Contracts

## Chosen Path

The canonical mutation-to-audit/feed contract is implemented in TeamsService transactions. Each mutation owns its domain write, AuditLog row, and ActivityEvent in one transaction, then publishes the typed activity only after the transaction resolves. This avoids guessing domain meaning from an HTTP URL and avoids depending on an event bus subscription that may not exist or may not include the relevant team consumer.

For comments, the service verifies author membership, resolves only same-team @principalId mentions, inserts TeamComment, writes a TEAM_COMMENT_CREATED AuditLog row with safe mention-count-only metadata, and creates the matching TEAM_COMMENT_CREATED ActivityEvent. The contract test verifies all of those database calls occur inside the transaction and checks that publish happens only after commit. Existing invitation and team audit/activity paths remain unchanged.

## System-Level Integration Contract

### Canonical mutation ordering

1. Authenticate the request and check the caller’s current team membership/role for the team.
2. Within one Prisma transaction, validate domain membership/recipient conditions and write the primary mutation.
3. Within that same transaction, write the corresponding AuditLog record and increment the per-team activity sequence before inserting its ActivityEvent.
4. Commit the transaction.
5. Only after commit, publish the returned typed activity event to the in-process team feed.

For comment creation, the audit record uses action TEAM_COMMENT_CREATED, targetType TEAM_COMMENT, targetId comment.id, actorId from the authenticated principal, the route teamId, outcome SUCCESS, and createdAt from the database. Metadata contains only mentionCount; it excludes comment text, tokens, credentials, and other private content. The ActivityEvent uses the same type, actor, team, and comment target and includes mentionCount in its payload metadata.

### REST and SSE boundary

REST history at GET /teams/:id/activity?afterSeq=N returns persisted event id, sequence, actorId, type, targetType, targetId, metadata, and createdAt in sequence order. The SSE stream accepts afterSequence, lastSequence, or Last-Event-ID; SSE data contains teamId, sequence, type, actorId, payload, and createdAt. Sequence is also the SSE event id; targetType and targetId are omitted from SSE data, and persisted metadata is exposed as payload. Consumers must not assume the REST and SSE data shapes are interchangeable.

### Shared-file ownership

- Assign one owner to teams.service.ts for atomic mutation/audit/activity changes and post-commit publication.
- Assign one owner to teams.controller.ts for route, DTO, and guard wiring.
- Assign one owner to team-role.guard.ts for live membership/role semantics.
- Assign one owner to teams.module.ts for providers/imports.
- Treat prisma/schema.prisma and migration order as a single-owner sequential gate; no schema or migration change was needed here.
- Keep the contract spec assertions separated by invariant, but have one owner integrate shared fixtures and verify the full combined suite.

## Exact Verification Outputs

Combined mocked suite command:
    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

Output:
    (node:9644) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use node --trace-warnings ... to show where the warning was created)

    Test Suites: 2 passed, 2 total
    Tests:       9 passed, 9 total
    Snapshots:   0 total
    Time:        4.203 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
    Exit code: 0

Nest build command:
    node ./node_modules/@nestjs/cli/bin/nest.js build
Output was empty; exit code: 0.

Diff check command:
    git diff --check
Output:
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
Exit code: 0.

PostgreSQL reachability command:
    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
Output:
    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False
Live PostgreSQL and HTTP checks remain NOT EXECUTED. The tests use mocks; no migration or live database request was run.

## UPSK Status

The read-only status command at timestamp 1795364104465 returned command.failed for status, with: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). The independent health request returned curl: (6) Could not resolve host: api.upsk.to. CLI version was upsk 0.1.30 at 2026-11-22 16:16:27 UTC. Local last_error.json was last written at 2026-11-22 15:42:22 UTC and describes an older Module 5 report-payload read failure without trace identifiers; it is stale and does not describe the current DNS error. No advancement command was attempted.

Ready-to-run PowerShell advancement command after connectivity returns:
    & "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to next --summary "Fixed comment mutation audit/feed alignment by recording a safe TEAM_COMMENT_CREATED AuditLog and ActivityEvent in one transaction and publishing only after commit; combined mocked tests passed 9/9, build/diff passed, and live PostgreSQL/HTTP checks remain NOT EXECUTED because port 5432 is unreachable." --evidence "progress\ai-augmented-engineering\module-06\interface-contracts-updated.md"

