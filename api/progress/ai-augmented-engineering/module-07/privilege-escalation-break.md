# Module 07 — BREAK: Privilege Escalation Analysis

**Checkpoint:** STEP 5 — BREAK
**Review approach:** Option B — AI-assisted first pass with manual critical-path review of authorization, role input, and persistence boundaries.

## How Privilege Escalation Can Arise

Privilege escalation occurs when a route checks only that the caller belongs to a team, but fails to require the right administrative role for a privileged operation. The risk becomes direct when the same route accepts an untrusted role value and writes it to a membership record. A MEMBER who can submit OWNER or ADMIN for their own membership could promote themselves; a caller able to name another user could promote an accomplice.

Validation and authorization solve different problems. A role enum or input allow-list can reject malformed or disallowed values, but it cannot prove the caller is allowed to grant a role. Conversely, an OWNER/ADMIN check is not enough if the endpoint allows an administrator to grant OWNER, lets a caller change their own role, or accepts an arbitrary target team/member ID without scoping the mutation to that team.

## Current Codebase Contracts

### Roles, Guards, and Routes

The Prisma schema defines TeamRole as OWNER, ADMIN, and MEMBER. TeamMember stores a role per (teamId, userId), with a unique constraint on that pair; the database enum limits values to known roles but does not decide who may assign them.

| EXISTING ROUTE | CURRENT AUTHORIZATION | PRIVILEGE-ESCALATION RELEVANCE |
|---|---|---|
| POST /teams | JWT authentication; the creator is assigned OWNER in the team-creation transaction | Owner assignment is server-controlled; no client role field is accepted for creation. |
| POST /teams/:id/invitations | RequireTeamRoles('OWNER', 'ADMIN') with live team_members lookup; DTO restricts invited role to ADMIN or MEMBER | Administrative roles can invite an ADMIN, but the route does not offer OWNER assignment. Recipient principal binding is required. |
| POST /teams/invitations/accept | JWT authentication; token lookup, PENDING/expiry checks, and exact recipientUserId match | Membership role comes from the stored invitation; caller cannot submit a new role at acceptance. |
| DELETE /teams/:id/invitations/:invitationId | RequireTeamRoles('OWNER', 'ADMIN'); service scopes invitation lookup by both IDs | A MEMBER cannot revoke an invitation through the route. |
| GET /teams/:id/audit-logs | RequireTeamRoles('OWNER', 'ADMIN') | A MEMBER cannot query the privileged audit endpoint through the route. |
| GET /teams/:id/activity, GET /teams/:id/activity/stream, POST .../pong | RequireTeamRoles('OWNER', 'ADMIN', 'MEMBER') | All current team roles are authorized for feed access; the feed also rechecks the role snapshot before event delivery and on heartbeat. |
| POST /teams/:id/comments, GET /teams/:id/comments | RequireTeamRoles('OWNER', 'ADMIN', 'MEMBER') | These are member-level actions, not role-management actions. |

TeamRoleGuard reads the caller's current role from team_members using a parameterized query bound to the requested team ID and request.user.principalId. It rejects absent membership and roles outside the route's declared set. The controller/service scan found no public endpoint that updates an existing TeamMember role; role changes observed in the integration spec are direct test-fixture SQL, not an API route.

### Role Input and Mutation Boundaries

The invitation DTO permits only ADMIN or MEMBER for invited role and does not permit OWNER. Invitation acceptance does not accept a role from the request; it uses the role stored on the recipient-bound pending invitation. This means the current user-facing paths do not expose a self-promotion field, although an authorized OWNER/ADMIN can intentionally invite someone as ADMIN.

If a future role-update route used a membership-only guard, a valid TeamRole input of ADMIN or OWNER would still be dangerous: both are valid enum values, and the database would persist them if the caller is authorized only as a MEMBER. If it accepted arbitrary role text, the enum might reject unknown values at the database boundary, but that constraint would still not prevent self-promotion to an allowed privileged enum value. The correct control is to require a live OWNER/ADMIN authorization for the same team, scope the target membership update by teamId and userId, reject self-promotion or OWNER grants unless a specific policy authorizes them, and use an explicit allow-list for assignable roles.

## Hypothetical Weak Endpoint: Attack and Impact

1. An authenticated MEMBER calls a hypothetical PATCH /teams/:teamId/members/:userId/role route.
2. The route checks only membership, or trusts a stale role claim instead of querying the current team_members row.
3. The request supplies role=OWNER or role=ADMIN, or targets the caller's own userId.
4. A weakly validated update writes the requested role without an explicit grant policy and target/team scoping.
5. The caller can then access OWNER/ADMIN-only operations such as invitation management and audit-log queries; OWNER could also become the basis for additional administrative behavior added later.

The schema enum and unique membership constraint do not stop this attack: they validate the shape/uniqueness of persisted data, not the authority of the actor making the change. A missing self-promotion guard is an additional path even when the endpoint otherwise checks that the caller is some team member.

## What Happens if Live Enforcement Fails

In the current source, TeamRoleGuard's database query is awaited and there is no fail-open fallback. If PostgreSQL is unavailable or the query throws, the request does not get an authorization success from this guard; the exception reaches the global HTTP filter and is expected to become a generic 5xx response. This is a fail-closed source-path assessment, not a live HTTP/DB observation.

If a future handler catches that error and defaults to MEMBER/OWNER, trusts token role claims, or skips the guard on one route, the failure could become an authorization bypass. The DB reachability probe returned False, so actual guard behavior under a connection failure and all role decisions over HTTP remain NOT EXECUTED.

## Verification Boundary and Results

The targeted Jest suites are mocked/in-memory checks. The integration spec contains database-backed lifecycle and role assertions, but it was not run because PostgreSQL at 127.0.0.1:5432 is unreachable. Consequently, the current route inventory and authorization behavior below are grounded in source inspection and mocked tests, not live HTTP enforcement.

Jest command:

    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
    (node:2660) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use `node --trace-warnings ...` to show where the warning was created)
    Test Suites: 2 passed, 2 total
    Tests:       14 passed, 14 total
    Snapshots:   0 total
    Time:        4.516 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
    EXIT_CODE=0

Nest build:

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

Therefore live PostgreSQL/HTTP enforcement checks remain NOT EXECUTED. No application implementation, Prisma, or package files were edited for this BREAK analysis.

## UPSK Connectivity and Ready-to-Run Advancement

UPSK status timestamp_unix_ms was 1795405287261 (2026-11-23 03:41:27.261 UTC). Exact error:

    {"timestamp_unix_ms":1795405287261,"level":"error","message":"command.failed","context":{"command":"status"}}
    Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"

The independent health probe returned curl: (6) Could not resolve host: api.upsk.to. This only establishes that this environment could not resolve the host. CLI version is upsk 0.1.30; the local last_error.json is stale from a Module 5 report-payload read failure (last modified 2026-11-22 15:42:22 UTC), with no trace identifiers for this attempt. No upsk next command was attempted.

After connectivity returns, run this exact PowerShell command:

    & "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to next --summary "Completed Module 07 BREAK by analyzing privilege-escalation paths, current TeamRoleGuard and route boundaries, role-input constraints, and the hypothetical impact of weak member-role updates; mocked suites passed 14/14 and Nest build passed, while PostgreSQL-backed HTTP checks remain NOT EXECUTED." --evidence "progress\ai-augmented-engineering\module-07\privilege-escalation-break.md"
