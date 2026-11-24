# Module 04 — STEP 6 FIX: IDOR Specification and Verification

## Fix Specification: `POST /teams/:teamId/invitations`

### Weak prompt vs. specific fix prompt

**Weak:** “Check that the user is an admin before creating an invitation.” This does not define which team is authoritative, what identity to trust, whether membership is current, how to reject an unauthorized caller, or what test proves the boundary. A superficially plausible response could check a stale JWT role, a global `isAdmin` flag, or only that `teamId` looks like a UUID.

**Specific:** “For `POST /teams/:teamId/invitations`, parse `teamId` as a UUID, authenticate the request, take the actor identity only from `request.user.principalId`, and query the current `team_members` row using both that `principalId` and the path `teamId`. Permit the operation only if that exact row has role `OWNER` or `ADMIN`; return `403` before the service writes anything for a `MEMBER` or non-member. Use parameterized SQL. Do not rely on a JWT role claim, a global admin check, a `// TODO`, or hard-coded user/team IDs. Verify an authorized owner/admin gets `201`, while an authenticated non-admin/non-member targeting that team gets `403` and causes no invitation/audit/activity writes.”

### Why placeholders do not fix IDOR

A `// TODO: check team permission` leaves the vulnerable behavior unchanged until someone implements and verifies it. A hard-coded condition such as `if (teamId === "known-team")` or `if (userId === "admin-user")` checks one fixture rather than the current principal's live membership in the requested team; it can reject legitimate teams and allow cross-team access when IDs differ. The authorization decision must bind the untrusted path `teamId` to the authenticated `principalId` in a database lookup and compare the stored role to the route's required roles on every request.

## Line-by-Line Review of the Current Authorization Path

### `src/teams/teams.controller.ts`

| Lines | Observed behavior | IDOR significance |
|---|---|---|
| 76 | `@Post(':id/invitations')` defines the team-scoped route. | `:id` is caller-controlled input and must not authorize itself. |
| 77 | `@RequireTeamRoles('OWNER', 'ADMIN')` requires one of the two management roles. | The allowed roles are explicit and specific to the invitation operation. |
| 78 | Defines `createInvitation`. | This is the route boundary where the guard runs before the handler. |
| 79 | `ParseUUIDPipe` validates the path team ID format. | Blocks malformed IDs; it is not itself an authorization check. |
| 80 | Accepts the validated invitation DTO. | Request body values do not supply the actor identity or permission. |
| 81 | Reads the authenticated `Principal`. | Identity comes from the authentication context. |
| 83 | Calls `createInvitation(teamId, principal.principalId, dto)`. | Passes the requested team and authenticated actor ID separately so the guard can bind both. |

### `src/teams/team-role.guard.ts`

| Lines | Observed behavior | IDOR significance |
|---|---|---|
| 20–21 | Defines a UUID syntax check. | Rejects malformed team identifiers before the SQL cast. |
| 23–26 | `RequireTeamRoles` composes `JwtAuthGuard` and `TeamRoleGuard` and stores the required roles. | Authentication and domain authorization are distinct checks; both run for the route. |
| 36–40 | Reads the route/class role metadata. | Applies the roles declared by the specific controller action. |
| 41–42 | Fails closed if no role policy is configured. | Missing policy does not become implicit access. |
| 44–46 | Reads the route team parameter and `request.user?.principalId`. | Uses the requested object ID and authenticated principal ID as the two lookup dimensions. |
| 47–49 | Rejects absent identity/team ID or malformed UUID. | Stops invalid requests before querying membership. |
| 50–53 | Executes parameterized `SELECT role FROM team_members WHERE team_id = ${teamId} AND user_id = ${principalId}`. | This is a real, live, team-scoped database lookup—not a placeholder, hard-coded identity, or untrusted JWT role claim. |
| 54–56 | Throws `ForbiddenException` if no membership row exists or the current role is outside the required list. | Authenticated non-members and members without `OWNER`/`ADMIN` receive `403`. |
| 57 | Returns `true` only after the membership and role check passes. | Only an authorized actor proceeds to invitation creation. |

### `src/teams/teams.service.ts`

| Lines | Observed behavior | IDOR significance / scope |
|---|---|---|
| 64–68 | `createInvitation(teamId, actorId, dto)` receives separate team and actor IDs. | The HTTP guard authorizes the pair before this service call; the service does not derive identity from the DTO. |
| 69–72 | Normalizes the email and creates a random token plus SHA-256 hash. | Invitation handling does not replace or bypass authorization. |
| 74 | Begins a Prisma transaction. | Related invitation/audit/activity writes share a transaction. |
| 75–82 | Optionally checks whether the target invitee is already a member of this team. | This is an invitee-conflict check, not the actor's authorization check; it must not be mistaken for IDOR protection. |
| 83–89 | Inserts the invitation with parameterized SQL scoped to `teamId`, uses the passed `actorId`, and handles duplicate pending invites. | The write is team-scoped and parameterized; permission has already been checked by the guard. |
| 90–95 | Writes audit/activity records and returns invitation data/token inside the same transaction. | No unrelated service logic was changed for this review. |

**Review conclusion:** The inspected current route uses a real `team_members` role query keyed by both `request.user.principalId` and the requested `teamId`; it is not a `TODO` or hard-coded placeholder. The service assumes the controller guard protects HTTP calls. Any future non-HTTP caller of this service would need an equivalent authorization boundary rather than assuming the controller guard runs there.

## Required Scenarios and Actual Results

| Scenario | Expected | Actual |
|---|---|---|
| **Admin/Owner** with a live `OWNER` or `ADMIN` membership calls `POST /teams/:teamId/invitations` with a valid team ID and invitation DTO. | `201 Created` after the guard permits the request and the service commits. | **NOT EXECUTED.** Static source path permits `OWNER`/`ADMIN` (`teams.controller.ts:77`; `team-role.guard.ts:50-57`), but no HTTP response was observed because PostgreSQL at `127.0.0.1:5432` is unreachable. |
| **Non-admin/non-member** calls the same route for a team where the principal is a `MEMBER` or has no membership row. | `403 Forbidden`; no invitation, audit, or activity write. | **NOT EXECUTED.** Static source path throws `ForbiddenException` when the row is absent or its role is not in `OWNER`/`ADMIN` (`team-role.guard.ts:54-56`). No database-backed request or write check ran. |

Reachability command: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` returned `False` (`TCP connect ... failed`). The expected `201` and `403` are source-derived expectations, not runtime verification. No `src/teams/` or `prisma/` files were edited; this FIX step changes only the progress review artifact.
