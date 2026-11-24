# Module 07 — FIX and Re-check Verification

**Checkpoint:** STEP 4 — VERIFY
**Review scope:** Targeted fixes for F-01, F-02, and F-03. The Prisma schema, migrations, package.json, and unrelated team features were not changed.

## F-01 — Recheck Live Team Membership and Role for Open Streams

TeamActivityFeedService now reads the caller's current team_members role before replay begins and stores that role with the connection. Before delivering each post-commit event and on each heartbeat, it queries membership again using parameterized teamId and principalId values. If the membership is gone, the role changed, or the recheck fails, the service emits authorization_revoked, completes the stream, clears its timer, and removes the connection; a reconnect must pass the route guard and establishes a fresh role snapshot.

The route currently permits OWNER, ADMIN, and MEMBER to read the feed. The service closes an existing stream on any role change, including a change between roles that remain feed-authorized; this forces the client to reconnect and receive a new authorization decision. The mocked tests cover both membership removal and role change before the next event, plus timer cleanup. Live revocation against PostgreSQL and the actual HTTP/SSE transport remains NOT EXECUTED.

## F-02 — Validate Comment Request Bodies

CreateTeamCommentDto.body now has IsString, IsNotEmpty, and MaxLength(5000) decorators. This makes body an explicit property for the global whitelist/forbidNonWhitelisted ValidationPipe and rejects non-string or over-limit requests before controller execution. TeamsService.createComment retains its trimmed nonblank check for whitespace-only text.

The unit suite exercises the real Nest ValidationPipe configuration in memory for a valid body, a non-string value, and a 5,001-character value. It also verifies that whitespace-only text is rejected by the service before a transaction begins. This is mocked/in-memory boundary verification, not a live HTTP request.

## F-03 — Require and Enforce Recipient Binding

Invitation creation now requires inviteeUserId, validates it as a non-empty bounded string, and rejects a missing/blank recipient before opening a database transaction or generating/persisting an invitation. The service stores that principal ID in recipient_user_id and continues to store the normalized invitedEmail, role, token hash, and seven-day database expiry; it does not infer or invent an email-to-principal mapping.

Acceptance now distinguishes a legacy invitation without recipient binding from a bound invitation presented by the wrong principal. Both fail predictably with 403, with explicit safe messages, and neither proceeds to acceptance or membership creation. A correctly bound invitation retains the existing single-use acceptance contract, and a mocked success test verifies that the intended recipient still reaches membership creation, audit/activity writes, and post-commit publication. Compatibility note: callers that previously omitted inviteeUserId must now provide the recipient principal; the existing endpoint, email field, role field, token handling, and successful response remain unchanged.

## Re-check Results

| CHECK | EVIDENCE | RESULT / LIMIT |
|---|---|---|
| Authentication and role enforcement | TeamRoleGuard still performs a live parameterized lookup by team ID and principal ID; role guard unit tests continue to reject MEMBER where OWNER/ADMIN is required and reject non-members | Mocked role behavior passed. No live route check was run. |
| F-01 stream authorization | Feed tests open as OWNER, then simulate membership removal or a role change before publishing sequence 1; neither case receives that event, both get authorization_revoked, complete, and clear the stream | Mocked service test passed. Live PostgreSQL/SSE revocation NOT EXECUTED. |
| F-02 input validation | ValidationPipe with whitelist and forbidNonWhitelisted accepts a valid comment body, rejects non-string and >5,000-character bodies; service rejects whitespace-only input | In-memory validation and service tests passed. Live HTTP NOT EXECUTED. |
| F-03 recipient binding | DTO requires inviteeUserId; service rejects blank/missing binding before transaction. Acceptance rejects stored-null recipient and wrong principal before acceptance update | Mocked service/DTO tests passed. Existing bound-recipient success path remains covered by integration-spec source but that DB-backed spec was not run. |
| IDOR and cross-team isolation | Controller route guards bind requested team ID to the current principal's membership; SQL uses parameterized team/principal values. Comment author and mention lookups are team-scoped; invitation mutation scopes both team and invitation IDs | Source and mocked query-argument checks only. No live cross-team HTTP test. |
| Regression contracts | Invitation creation still writes audit and activity records atomically and publishes after commit; comment transaction audit/activity contract remains covered; feed reconnect, heartbeat, and disconnect tests remain in the combined run | Targeted mocked suites passed. |

## Commands and Exact Outputs

Jest command:

    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
    (node:17168) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use `node --trace-warnings ...` to show where the warning was created)
    Test Suites: 2 passed, 2 total
    Tests:       14 passed, 14 total
    Snapshots:   0 total
    Time:        5.106 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
    EXIT_CODE=0

Nest build command:

    node ./node_modules/@nestjs/cli/bin/nest.js build
    EXIT_CODE=0

Whitespace check:

    git diff --check
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
    EXIT_CODE=0

PostgreSQL reachability:

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

The report file is untracked, so git diff --check does not inspect its whitespace; a separate trailing-whitespace scan of this report and the six modified team files passed. Live PostgreSQL/HTTP checks, database-backed integration runs, and migration application remain NOT EXECUTED.

## UPSK Connectivity and Advancement

UPSK status timestamp_unix_ms was 1795365986492, with exact error output:

    {"timestamp_unix_ms":1795365986492,"level":"error","message":"command.failed","context":{"command":"status"}}
    Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"

The independent health probe returned curl: (6) Could not resolve host: api.upsk.to. CLI version: upsk 0.1.30. Diagnostic clock: 2026-11-22 16:53:42.401 UTC. The local last_error.json is stale (last modified 2026-11-22 15:42:22 UTC; earlier Module 5 report-payload read failure) and contains no correlation/request IDs for this attempt. No advancement was attempted.

Ready-to-run PowerShell command after connectivity returns:

    & "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to next --summary "Completed Module 07 VERIFY by fixing stream authorization rechecks, comment DTO validation, and invitation recipient binding; targeted mocked suites passed 13/13 and Nest build passed, while PostgreSQL-backed HTTP checks remain NOT EXECUTED." --evidence "progress\ai-augmented-engineering\module-07\fix-and-recheck-verification.md"
