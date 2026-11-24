# Module 07 — FIX: Privilege Escalation Hardening Contract

**Checkpoint:** STEP 6 — FIX
**Scope:** Design and verification contract for any future team-member role mutation. No role-update endpoint was added, and no implementation, Prisma, migration, or package files were changed in this step.

## Exploit Trace and Semantic Intent

A weak role-mutation path can turn an ordinary team membership check into privilege escalation. If the caller need only be a member, or the route trusts a stale token role instead of the current membership row, an attacker can submit a valid privileged role and promote themselves or another account. A self-promotion path is especially dangerous when the handler does not distinguish the actor membership from the target membership.

An enum or input validator does not provide authorization. TeamRole contains OWNER, ADMIN, and MEMBER, so OWNER and ADMIN are valid database values; a database enum can reject an unknown string but cannot decide whether this actor may grant a known privileged role. An AI given only literal instructions such as “add role update” may implement the field assignment and a membership check while missing the semantic policy: who may grant each role, whether self-changes are forbidden, and how the mutation is audited atomically.

## Current Codebase Grounding

The Prisma schema defines TeamRole as OWNER, ADMIN, and MEMBER, and TeamMember stores one role per unique teamId/userId pair. The enum and unique constraint protect value shape and membership uniqueness; neither establishes grant authority. TeamRoleGuard currently performs a parameterized lookup of the caller's live role by requested team ID and principalId, then checks it against the route's declared role set.

There is no current public route or TeamsService operation that updates an existing TeamMember role. POST /teams assigns OWNER to the creator inside the creation transaction. Invitation creation is OWNER/ADMIN-only and its DTO permits only ADMIN or MEMBER; acceptance uses the stored recipient-bound invitation role rather than a client-supplied role. The test integration spec changes roles with fixture SQL, which is not a production API endpoint.

Existing mutation patterns provide a useful template: team, invitation, and comment operations write AuditLog and ActivityEvent records within their Prisma transaction, then publish the typed activity only after the transaction commits. The event/audit shape should identify actor, team, action, target, and outcome, but must not contain raw invite tokens, secrets, or unnecessary personal data.

## Six-Point Hardening and Test Contract

| # | REQUIRED CONTROL | CONTRACT FOR A FUTURE MEMBER-ROLE MUTATION |
|---|---|---|
| 1 | Live OWNER/ADMIN authorization | Authenticate the caller and query current TeamMember membership for the same team on every mutation. Require OWNER or ADMIN; deny non-members and MEMBER callers. Never rely on a token/session role claim as the authority source. |
| 2 | Reject self-role changes | Reject actorUserId == targetUserId, including self-promotion and self-demotion, unless a separately reviewed recovery workflow explicitly permits it. Do not let the request choose a different target identity to evade the rule. |
| 3 | Validate assignable roles explicitly | Accept only the documented role values using a DTO allow-list and service-level policy. Do not accept arbitrary enum text, OWNER by default, or a role copied blindly from the request. |
| 4 | Enforce role hierarchy | An ADMIN must never grant OWNER. Define whether ADMIN may grant ADMIN or only MEMBER; OWNER may grant only the roles permitted by the approved team policy. The database enum is not a substitute for this policy check. |
| 5 | Record atomic audit and activity | In one transaction, update the target membership and write one AuditLog plus one ordered ActivityEvent with safe metadata. Roll back all writes if any part fails; publish the event only after commit. Exclude raw credentials/tokens and unnecessary PII. |
| 6 | Add boundary and regression tests | Cover owner/admin/member/nonmember, self-target, cross-team target, invalid role, ADMIN-to-OWNER denial, allowed grant cases, transaction rollback, exact audit/event writes, and proof that publish occurs after commit. Test 401/403/400/409 HTTP contracts when an isolated DB is available. |

For cross-team isolation, both the actor authorization query and target update must include the same team ID, and the target must be looked up by the pair (teamId, userId). A valid user ID from another team must not be enough to mutate that membership.

## Re-check and Verification Results

| AREA | SOURCE / MOCKED EVIDENCE | RESULT AND LIMIT |
|---|---|---|
| Authorization | RequireTeamRoles composes JWT and TeamRoleGuard; the guard queries live team_members role by parameterized teamId and principalId. Mocked contracts reject MEMBER and nonmember callers for OWNER/ADMIN-only operations. | Existing guard contract passes in mocks. There is no role-mutation route to exercise, and live DB/HTTP enforcement is NOT EXECUTED. |
| Role validation | The current invitation DTO restricts invite roles to ADMIN/MEMBER; role acceptance uses the stored invitation. There is no role-update DTO or endpoint. | Current route does not accept OWNER via invitation. The six-point role-mutation policy above is a future endpoint requirement, not an implemented feature. |
| IDOR / cross-team isolation | Guard and service SQL bind team ID and principal ID; invitation lookup scopes both team and invitation IDs. Comment and membership checks are team-scoped. | Static and mocked query-argument evidence only. No live cross-team HTTP test was run. |
| Regression | Feed and collaboration mock suites exercise existing live-role guard contracts, recipient binding, post-commit audit/activity behavior, feed rechecks, validation, and replay/heartbeat paths. | 2 mocked suites and 14 tests passed. No new role-mutation behavior is claimed. |

Exact requested command outputs:

Jest:

    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
    (node:25880) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use `node --trace-warnings ...` to show where the warning was created)
    Test Suites: 2 passed, 2 total
    Tests:       14 passed, 14 total
    Snapshots:   0 total
    Time:        2.967 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
    EXIT_CODE=0

Nest build:

    node ./node_modules/@nestjs/cli/bin/nest.js build
    EXIT_CODE=0

Whitespace check:

    git diff --check
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
    EXIT_CODE=0

Database availability:

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

Thus live PostgreSQL/HTTP role-mutation checks, migrations, and database-backed integration tests remain NOT EXECUTED. Because the report is untracked, a separate trailing-whitespace scan was run and returned no matches.

## UPSK Connectivity and Ready-to-Run Advancement

UPSK status failed at timestamp_unix_ms 1795405535860 (2026-11-23 03:45:35.860 UTC). Exact status output:

    {"timestamp_unix_ms":1795405535860,"level":"error","message":"command.failed","context":{"command":"status"}}
    Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"

The independent health probe returned curl: (6) Could not resolve host: api.upsk.to. CLI version is upsk 0.1.30. The local last_error.json is stale from a Module 5 report-payload read failure (last modified 2026-11-22 15:42:22 UTC), with no request/correlation IDs for this attempt. No advancement was attempted.

After connectivity returns, run:

    & "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to next --summary "Completed Module 07 FIX by documenting a six-point authorization, role-validation, hierarchy, atomic audit/activity, and boundary-test contract for any future team-role mutation; existing mocked suites passed 14/14 and Nest build passed, while PostgreSQL-backed HTTP checks remain NOT EXECUTED." --evidence "progress\ai-augmented-engineering\module-07\privilege-escalation-fix-and-verification.md"
