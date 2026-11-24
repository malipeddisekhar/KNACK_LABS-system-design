# Module 07 — Security and Architecture Review Reflection

**Checkpoint:** STEP 7 — REFLECT
**Decision:** Option B — AI-Assisted Hybrid / Manual Critical Path
**Evidence boundary:** Source review and mocked tests are distinguished from live database and HTTP evidence. PostgreSQL at 127.0.0.1:5432 was unreachable, so live PostgreSQL/HTTP checks remain NOT EXECUTED.

## Audit in Hindsight

The comprehensive review recorded nine findings: **Critical: 0; High: 3; Medium: 4; Low: 2.** The High findings were F-01 (an existing activity stream could outlive a membership/role change), F-02 (comment DTO metadata conflicted with the global validation pipe), and F-03 (an invitation without recipient binding could not be accepted). The Medium findings were F-04 through F-07: invitation-email PII in audit metadata, unbounded list/replay work, REST/SSE event-shape differences, and missing executed database-backed integration proof. The Low findings were F-08 (fixed development credentials in an integration fixture) and F-09 (a duplicated local TeamRole union).

Seven findings were structural or contract-level: authorization lifetime, HTTP validation, recipient identity, audit privacy policy, bounded data/replay behavior, REST/SSE event compatibility, and the integration-proof boundary. The two Low findings were maintenance/hygiene concerns rather than direct architectural breaks. This severity count reflects the findings in comprehensive-review-findings.md; it does not claim the underlying production risks were runtime-reproduced.

### Privilege-Escalation Hindsight

The review did not find an existing public member-role update endpoint or a demonstrated self-promotion exploit. The risk is compositional and hypothetical: a route that checks only membership, accepts OWNER or ADMIN as an untrusted role value, and permits the actor to target their own membership could turn a valid TeamRole enum value into unauthorized privilege escalation. A separate failure to scope the target by teamId could extend the same flaw into cross-team IDOR.

The current controls reduce that risk on the existing paths: TeamRoleGuard checks the live caller role for the requested team, OWNER/ADMIN-only routes name their allowed roles, invitation DTOs allow only ADMIN/MEMBER, and invitation acceptance takes its role from the stored recipient-bound invitation. The team role schema enum prevents unknown values, but cannot decide who is allowed to grant a known value. The six-point future role-mutation contract is recorded in privilege-escalation-fix-and-verification.md.

### Living Security Checklist

The UPSK status and health probes could not retrieve the official REFLECT prompt during this pass. The following ten-point living checklist consolidates the review requirements and concrete findings from the saved Module 07 artifacts; it is a working operational checklist, not a claim that these are verbatim official checklist labels. Compare it with the official wording when UPSK is reachable.

1. **Authentication and principal identity:** Require JWT authentication on protected routes and derive principalId from the verified principal, never from a client-supplied actor field.
2. **Authorization and least privilege:** Declare route roles explicitly and query current membership/role for the same team before protected operations.
3. **IDOR and tenant scoping:** Bind every resource read/write to teamId and resource ID together; test cross-team IDs and absent memberships.
4. **Role hierarchy and self-promotion:** Reject self-role changes, restrict assignable roles, and prevent ADMIN from granting OWNER; define owner/admin policy before implementation.
5. **Input validation and resource bounds:** Validate type, format, allow-list, presence, and maximum size; bound pagination, replay, and request bodies.
6. **Injection resistance:** Keep database values parameterized, including membership, target, filter, and cursor values; do not concatenate client input into SQL.
7. **Secrets and sensitive data:** Hash one-time tokens, never log raw credentials, classify email/comment/identity data, and define redaction and retention.
8. **Safe errors and security logging:** Do not expose stack traces or internal 5xx details; retain request correlation while preventing secrets and unsafe user input from entering logs.
9. **Atomicity and abuse resistance:** Keep domain mutation, AuditLog, and ActivityEvent writes in one transaction; publish after commit; test replay, concurrency, retry, and failure paths.
10. **Verification and dependency hygiene:** Combine focused unit tests with isolated database-backed and HTTP tests; run dependency review; mark any unavailable live test NOT EXECUTED rather than inferred from mocks.

**Custom extensions from this review:** Reauthorize long-lived SSE connections on events and heartbeats; revoke a stream if the membership role changes; require invitation recipient principal binding; keep REST and SSE payloads reconcilable; test comment DTO behavior through the actual global ValidationPipe; limit large history replays; verify audit PII policy; and require an isolated url_shortener_test database before making live persistence or HTTP claims.

## Evaluation Answers

### Why AI Can Miss Semantic Privilege-Escalation Intent

AI can implement the literal shape of “update a member role” and satisfy a type check while missing the policy question of who may grant which role to whom. An enum says OWNER is a valid value; it does not say a MEMBER must not be allowed to assign it. If the prompt omits actor-versus-target identity, self-promotion rules, role hierarchy, cross-team scope, and negative cases, a plausible handler may still be authorization-unsafe.

### How to Prompt Role and Permission Work Cleanly Up Front

Specify the route and exact actor/target/team identifiers; require a live OWNER/ADMIN check scoped to the same team; reject self-targeting; define the grant matrix, including that ADMIN cannot grant OWNER; and validate the role with an allow-list. Require a single transaction for membership change plus safe audit/activity records, post-commit publication, and tests for allowed and denied role pairs, invalid roles, self-target, cross-team IDs, rollback, and replay. State the expected HTTP status/envelope and the isolated database needed for live proof.

### Authorization Chain Walk-Through

For an existing privileged route, the request enters the TeamsController route, JwtAuthGuard validates the bearer token and supplies principalId/username, and RequireTeamRoles invokes TeamRoleGuard with the route's allowed roles. The guard loads the current role from team_members using parameterized teamId and principalId values; if a future role mutation existed, its service would also need to verify target membership in that same team, enforce the grant matrix, and update the membership and audit/event rows transactionally. The chain can fail if the route omits the guard, the guard uses stale claims, team ID is missing or mismatched, the query is unscoped, the service trusts the role field, self-targeting is permitted, or side effects are published before commit. In the current source, no role-update route exists, and live database enforcement was not exercised.

### What AI Scanning Catches and Misses

Static AI review is useful for finding missing decorators, route guards, parameterized SQL, obvious sensitive fields, inconsistent error handling, and absent tests. It is weaker at inferring the product's permission hierarchy, deciding whether invitation-email retention is compliant, understanding real tenant relationships, and proving database concurrency or behavior after a live role change. Those gaps need an explicit policy matrix, manual critical-path review, and runtime evidence.

## Option B Decision Callback

Option B — AI-Assisted Hybrid remains appropriate: use AI for broad inventory, repeated pattern checks, and draft test matrices, then manually inspect high-risk route-to-guard-to-service-to-database paths. The nine findings show why a scan alone is not enough: the most important risks involved semantic authorization lifetime, recipient identity, and data-policy decisions rather than a syntax defect. The human review corrected the interpretation boundary and kept conclusions tied to code and test evidence.

## Ship Recap — Risk and Mitigation

The main residual risk is treating passing mocked tests and a successful build as proof of live database authorization, migration correctness, or end-to-end role behavior. The mitigation is to keep PostgreSQL/HTTP assertions marked NOT EXECUTED until the isolated url_shortener_test database is reachable, then run authenticated HTTP cases for role denial, target-team scoping, self-promotion rejection, and role hierarchy. Do not use a non-test database for those checks.

## Comprehension Questions 1–3

1. **Why is an enum not authorization?** It limits values to known roles but does not determine whether the caller has permission to grant one.
2. **What prevents role-update IDOR?** A live owner/admin authorization for the requested team plus a target lookup/update constrained by both teamId and userId.
3. **Why write audit/activity atomically and publish after commit?** It keeps the persisted change and its evidence consistent, and prevents subscribers from seeing an event for a transaction that later rolls back.

## Mini Practical Task Proof

The concrete deliverable is the Module 07 security review and role-mutation hardening contract, particularly comprehensive-review-findings.md and privilege-escalation-fix-and-verification.md. The reproducible checks in this REFLECT pass were:

    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
    Test Suites: 2 passed, 2 total
    Tests:       14 passed, 14 total
    EXIT_CODE=0

    node ./node_modules/@nestjs/cli/bin/nest.js build
    EXIT_CODE=0

    git diff --check
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
    EXIT_CODE=0

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

This is mocked unit/build evidence only. Live PostgreSQL/HTTP tests and the database-backed integration spec are NOT EXECUTED. A concrete risk is that a mock may approve a role path that the real guard, schema, or transaction behaves differently on; mitigation is to verify against the guarded url_shortener_test database before claiming end-to-end coverage.

## UPSK Submission Status

The read-only status command failed at timestamp_unix_ms 1795405769973 (2026-11-23 03:49:29.973 UTC):

    {"timestamp_unix_ms":1795405769973,"level":"error","message":"command.failed","context":{"command":"status"}}
    Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"

An independent health probe returned curl: (6) Could not resolve host: api.upsk.to. CLI version is upsk 0.1.30; diagnostic clock read 2026-11-23 03:50:44.856 UTC. The local last_error.json is stale from a Module 5 report-payload read failure (last modified 2026-11-22 15:42:22 UTC); it has no trace IDs for this attempt. The report is saved without a nonce and has not been submitted; no advancement was attempted.
