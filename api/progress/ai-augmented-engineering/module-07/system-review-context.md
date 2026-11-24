# Module 07 — Security and Architecture Review Context

## Evidence Boundary

This assessment distinguishes code/schema observations from the judgment and production evidence an AI reviewer cannot supply by itself. Source and schema were inspected read-only. Existing mocked team/feed tests cover selected contracts; their latest recorded run from Module 06 FIX passed 2 suites and 9 tests, but those tests are not live database or HTTP proof. In this CONTEXT step, no application tests, HTTP requests, database queries, or migrations were run.

The requested TCP check returned False for 127.0.0.1:5432. Live PostgreSQL/HTTP checks are **NOT EXECUTED**. No changes were made to prisma/, package.json, or src/teams/.

## 1. Business Logic Correctness

**Visible in code and schema:** Team creation gives the creator OWNER membership. Protected team operations use the current team membership role. Invitations are bound to a recipient principal, have pending/accepted/revoked/expired states, and enforce one pending invite per team/email in the schema. Acceptance is conditional on pending status and expiry. Comments reject blank bodies in the service and resolve @principalId mentions only against members of the same team. Team, invitation, and comment mutations write audit/activity records transactionally and publish activity after commit.

**What still needs a human decision:** Confirm whether roles, invitation recipient binding, expiry timing, re-invitation after revoke/expiry, comment mention syntax, and the absence of thread/reply/edit/delete routes match product requirements. Decide whether comment creation and invitation lifecycle are sufficient coverage for the collaboration feature. Code cannot determine intended product behavior from field names alone.

**Evidence boundary:** The existing mocked tests exercise live-role guard behavior, comment mention filtering, invitation audit/activity consistency, cursor replay, and stream heartbeat/disconnect behavior. Mock data cannot establish that the actual database returns the same membership rows or that every HTTP payload passes global validation. The collaboration integration test that boots AppModule was not executed in this context step.

## 2. Security in Context

**Visible in code and schema:** RequireTeamRoles combines JWT authentication with a live, parameterized team_members query scoped by team UUID and principalId. The guard rejects missing/invalid team identity and insufficient roles. Invitation tokens are stored as hashes, and acceptance requires the exact non-null recipient principal. Audit output recursively filters metadata keys that resemble secrets; comment audit metadata contains only mentionCount.

**Human security review required:** Confirm whether the invitation creation audit metadata containing invitedEmail is appropriate PII, and define retention, access, and redaction rules for it. Decide whether audit access and event delivery are sufficiently restricted for the organization’s threat model. Confirm the one-time raw invitation token response is protected in the real client and transport path. Key-name redaction does not decide whether a sensitive value is acceptable to collect or retain.

**Evidence boundary:** Guard and service code plus mocked role/recipient tests support source-level claims only. No live authorization probe, token replay HTTP test, or database-backed security test was executed because PostgreSQL is unreachable.

## 3. Architectural Coherence

**Visible in code and schema:** TeamsService owns team mutations, audit/activity writes, activity sequence increments, and post-commit publication. TeamActivityFeedService handles team-scoped subscriptions, persisted replay, heartbeats, disconnect cleanup, and reconnect sequence handling. The Prisma schema models Team, TeamMember, TeamInvitation, AuditLog, ActivityEvent, and TeamComment with their current indexes and relations.

**Human architecture review required:** Decide whether process-local feed subscribers are acceptable for the deployment topology. The current service has no shared pub/sub fan-out, so another API instance will not directly notify subscribers connected only to this process. REST activity responses include id, targetType, targetId, and metadata; SSE data omits targetType/targetId and exposes metadata as payload. Consumers and client owners must confirm that this difference is intentional and sufficient.

**Evidence boundary:** Existing tests use in-memory subscribers and mocked Prisma. They do not prove reconnect behavior over HTTP, delivery across instances, or compatibility with deployed clients.

## 4. Data Integrity Under Pressure

**Visible in code and schema:** TeamMember has a unique (teamId,userId) constraint; active pending invitations have a partial unique constraint on (teamId,invitedEmail); ActivityEvent has a unique (teamId,sequence) constraint. Mutation paths use Prisma transactions, conditional invitation state updates, and per-team sequence increments before inserting events. AuditLog restricts team deletion while membership, invitation, activity, and comment relations use their schema-defined cascade rules.

**Human and runtime validation required:** Check concurrency behavior, transaction isolation, retry behavior, connection pressure, backup/restore expectations, and whether cascading deletion of comments/invitations/events matches retention policy. Code review cannot establish production write contention or recovery behavior. The mocked unit suite does not simulate database locking, concurrent transactions, failover, or migration application.

**Execution boundary:** Test-NetConnection to 127.0.0.1:5432 returned False. Live PostgreSQL writes, HTTP checks, migration execution, and load/concurrency tests are **NOT EXECUTED**.

## 5. Compliance Requirements

**Visible in code and schema:** Audit records store actor, action, target, outcome, optional JSON metadata, and timestamp; team/time and actor indexes support queries. Invitation records contain invited email and recipient identity, while comment records store body and mention principal IDs. Audit metadata redaction filters certain sensitive key names, but does not define retention, legal basis, residency, access review, or deletion policy.

**Human compliance/security review required:** Confirm the applicable regulatory and contractual requirements before release: whether invitation emails and comment content are personal data, how long audit records must be retained, who may query them, whether subject access/deletion requests apply, and whether regional storage or immutable audit controls are required. The schema's AuditLog onDelete Restrict behavior is a technical rule, not proof of compliance. No policy or legal requirements can be inferred from this repository alone.

## Verification Commands and Current Status

Read-only source/schema inspection found the contracts described above. git diff --check returned exit code 0 with this warning: warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it.

The explicit database reachability command and output were:

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

Therefore live PostgreSQL/HTTP runs remain **NOT EXECUTED**.

UPSK status command returned:

    {"timestamp_unix_ms":1795365003406,"level":"error","message":"command.failed","context":{"command":"status"}}
    Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN.

The independent health probe returned: curl: (6) Could not resolve host: api.upsk.to. This is reachability from this environment, not confirmation of a service-wide outage. CLI version was upsk 0.1.30; the status timestamp is 2026-11-22 16:30:03.406 UTC. Local last_error.json was last written at 2026-11-22 15:42:22 UTC and contains an older Module 5 report-payload read failure without trace identifiers; it does not describe this status failure. No advancement was attempted.

Ready-to-run PowerShell advancement command after connectivity returns:

    & "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to next --summary "Completed Module 07 CONTEXT by assessing business logic, security, architecture, data integrity, and compliance boundaries against the team implementation; local PostgreSQL is unreachable, so live database/HTTP checks remain NOT EXECUTED." --evidence "progress\ai-augmented-engineering\module-07\system-review-context.md"

