# Module 06 — Parallel Coordination Context

## Read-Only Codebase Snapshot

This note is based on a read-only inspection of the existing Team Collaboration code and Prisma schema. No files under src/teams or prisma, and no package metadata, were changed.

| Contract | Observed shape and current owner |
|---|---|
| Team and membership | Prisma Team maps to teams and carries name, timestamps, and activitySequence. TeamMember maps to team_members with teamId, userId, TeamRole (OWNER, ADMIN, MEMBER), a unique (teamId, userId) constraint, and a userId index. |
| Invitations | TeamInvitation maps to team_invitations. It stores invitedEmail, optional recipientUserId, role, SHA-256 tokenHash, status, expiry and acceptance fields. A partial unique constraint permits only one PENDING invite for a team/email pair. Acceptance is explicitly bound to recipientUserId; null recipient bindings fail closed. |
| Activity | ActivityEvent maps to activity_events with per-team BigInt sequence, actor, type, target, metadata, and createdAt; (teamId, sequence) is unique. Team also stores the current activity sequence. The activity feed service streams/replays events and tracks heartbeat/disconnect lifecycle. |
| Comments | TeamComment maps to team_comments with teamId, authorId, body, JSON mentions, and createdAt. The service resolves @principalId mentions only against current members. |
| Audit | AuditLog maps to audit_logs with actor, action, target, outcome, optional JSON metadata, and createdAt; it is indexed by (teamId, createdAt) and actorId. |
| Principal and RBAC | Controller actions receive a Principal with principalId and username. RequireTeamRoles composes JWT authentication with TeamRoleGuard, which queries team_members live using teamId and principalId. The route layer uses UUID parsing for team identifiers. |
| Transaction and event contract | TeamsService writes mutations and related audit/activity records transactionally. It publishes the typed activity event only after the transaction commits. The feed is process-local, so this source inspection does not establish multi-instance fan-out. |

The inspected files include the team controller, service, module, role guard, activity-feed service and tests, collaboration test, and the DTOs for creating teams, invitations, and comments. The schema already defines Team, TeamMember, TeamInvitation, ActivityEvent, TeamComment, AuditLog, TeamRole, and TeamInvitationStatus; any proposed schema changes must therefore be treated as coordinated contract changes, not assumed missing work.

## Why Parallel Work Helps — and Where the Merge Problem Starts

Parallel execution speeds up independent work because separate contributors can review distinct requirements, write isolated tests or documentation, and implement bounded components at the same time. It becomes the Merge Problem when contributors change shared files or make incompatible assumptions about a shared contract: one person builds a wall to one measurement while another builds the doorway to a different one. In this codebase, teams.controller.ts, teams.service.ts, teams.module.ts, schema.prisma, and migration ordering are shared interfaces; concurrent edits there can conflict textually or compile while disagreeing semantically.

A merge is not complete merely because Git accepts it. The integration owner must check route signatures, DTO fields, principal identity, role semantics, transaction boundaries, table mappings, event shapes, migration order, and tests together.

## Micro-Exercise 1 — What Can Run in Parallel?

Parallelize work that has a stable contract and exclusive file ownership. For example, separate reviewers can analyze invitation lifecycle, comment mention edge cases, audit-log privacy, and activity reconnect behavior; separate contributors can add isolated spec files or docs for those domains once fixtures and interfaces are agreed. The current implementation centralizes routes and mutations in shared controller/service files, so implementation slices that touch those files should have one owner or be scheduled as sequential integration patches.

| Workstream | Safe parallel slice after contract freeze | Shared-file/table collision to avoid |
|---|---|---|
| Team Invitations | Independent test design for create, revoke, recipient binding, expiry, and replay; invitation-specific DTO/service work if file ownership is exclusive. | TeamInvitation schema/migration, teams.controller.ts, and teams.service.ts edits with another workstream. |
| RBAC | Independent negative-case test design for member, non-member, and demoted-role callers. | Multiple changes to team-role.guard.ts or role decorator semantics; this is the common authorization gate. |
| Activity Feed | Feed-specific tests or client/replay review, isolated from mutation handlers. | ActivityEvent sequence/schema changes or simultaneous edits to teams.service.ts transaction/event hooks. |
| Comment Threads and @Mentions | Comment validation and mention test cases in an owned spec/DTO slice after the membership and event contracts are fixed. | TeamComment schema/migration and shared comment/event mutation path edits by multiple contributors. |
| Audit Log | Privacy review and query tests after the AuditLog fields and OWNER/ADMIN policy are fixed. | AuditLog schema changes or concurrent route/service edits; audit writes must stay atomic with the mutation they describe. |

Parallelism is therefore strongest for analysis, test design, and isolated files. If contributors must edit the same controller, service, Prisma schema, or migration sequence, use a single integrator and serialize those edits.

## Micro-Exercise 2 — What Must Be Sequential or Gated?

First freeze the shared identity and persistence contracts: Principal identity is principalId plus username; TeamMember.userId is compared with principalId; route team IDs are UUIDs; role values are OWNER, ADMIN, and MEMBER; invitation acceptance uses the explicit recipientUserId binding; activity cursors use per-team sequence values. Keep one owner for schema/migrations and land those contracts before consumers rely on them.

Next establish the live role guard and shared transaction/event helper. Then feature handlers can be split by clear ownership, but integration of mutation, AuditLog, ActivityEvent, and post-commit publication remains gated: these records must describe the same committed operation. Invitation acceptance also depends on the final recipient-binding and status/expiry contract. Comments depend on TeamComment storage, active-member mention resolution, and the ActivityEvent payload. Audit queries depend on the finalized audit fields and the OWNER/ADMIN guard policy. Run migrations and database-backed tests only after the schema and migration owner reports the contract ready.

## Micro-Exercise 3 — Dependency Graph and Coordination Rule

Text dependency graph:

    Principal {principalId, username}
                    |
                    v
    JwtAuthGuard + live TeamRoleGuard(teamId, principalId)
                    |
                    v
    Team / TeamMember / TeamRole contract
          |                         |
          v                         v
    Invitation model           AuditLog fields/policy
    recipient binding               |
    status + expiry                  |
          |                          |
          +----------+---------------+
                     v
       Transactional mutation + audit/activity writes
                     |
       +-------------+----------------------+
       |                                    |
       v                                    v
    TeamComment + @Mentions          ActivityEvent sequence
    active member resolution         unique per team
       |                                    |
       +---------------+--------------------+
                       v
             Post-commit feed publication
                       |
                       v
       authorized stream, ordered replay, heartbeat,
                reconnect, and lifecycle tests

Coordination rule: name one owner for each shared file/table, publish its interface before dependent work starts, and reserve a single integration owner for controller/service wiring, migration order, and end-to-end consistency. Keep feature contributors on isolated files where possible; require review and focused tests for every cross-boundary contract.

## Carry-Forward Verification Constraint from Module 05

The Module 5 activity-feed suite used mocked Prisma/JWT dependencies and in-memory subscribers; its 6 passing tests establish only the exercised unit behavior, not database-backed HTTP behavior or multi-instance delivery. The current TCP check to 127.0.0.1:5432 returned False, so all live PostgreSQL/HTTP checks are marked NOT EXECUTED. Do not describe mocks, source inspection, or a successful build as proof of a live database run.

## Verification and UPSK Reachability Record

This step used read-only source inspection; no application tests or database/HTTP operations were run. On 2026-11-22 15:46:21 UTC, CLI version upsk 0.1.30 returned this status failure at timestamp_unix_ms 1795362358433: {"timestamp_unix_ms":1795362358433,"level":"error","message":"command.failed","context":{"command":"status"}}; the CLI said it could not reach api.upsk.to and advised checking DNS, proxy, firewall, or VPN. The independent health probe returned: curl: (6) Could not resolve host: api.upsk.to. This records reachability from this environment only, not a service-wide outage.

The local last_error.json was last written at 2026-11-22 15:42:22 UTC and reports an older failure reading the Module 5 report payload; it has no current status trace identifiers and does not describe this DNS failure. No advancement was attempted.



## Post-Write Verification

- git diff --check returned exit code 0. Git printed this existing line-ending notice: warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it.
- Trailing-whitespace scan of this file found 0 lines.
- Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet printed WARNING: TCP connect to (127.0.0.1 : 5432) failed and returned False. Therefore live PostgreSQL-backed and HTTP verification remains NOT EXECUTED. This was a TCP reachability probe only; no database operation or application test was run.


