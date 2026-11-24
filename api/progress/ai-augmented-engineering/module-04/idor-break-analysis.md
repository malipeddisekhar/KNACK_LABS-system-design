# Module 04 — STEP 5 BREAK: IDOR on Team Invitation Creation

## Symptom and Attack Shape

An Insecure Direct Object Reference (IDOR) occurs when a caller is authenticated but the server does not verify that the caller may act on the specific object named by the request. For `POST /teams/:teamId/invitations`, authentication alone is insufficient: the caller must be an authorized `OWNER` or `ADMIN` of the team identified by `teamId`.

If the route only checked for a valid login and trusted the path UUID, a user who controls Team A could replace its ID with a guessed, observed, or otherwise obtained Team B UUID. The handler could then create a pending invitation for an email in Team B, potentially granting a new person access to Team B. The attacker would not need to compromise the invited person's account; the authorization failure is that the server accepts a team-scoped write from a caller who has no qualifying role in that team.

Generic training-data patterns often show authentication middleware and then proceed directly to a handler that trusts a route ID. That pattern proves “who is calling” but omits the domain authorization question “may this principal perform this operation on this particular team right now?” Team ownership and membership are application data, so they require an explicit live lookup rather than an assumption derived from a valid JWT or possession of a UUID.

## Current Workspace Defense (Source-Level Evidence)

1. `src/teams/teams.controller.ts:76-84` binds `POST :id/invitations` to `@RequireTeamRoles('OWNER', 'ADMIN')`.
2. The controller parses `:id` with `ParseUUIDPipe` at line 79, obtains the authenticated `Principal`, and passes `principal.principalId` to `createInvitation` at line 83. The caller cannot choose the actor ID in the request body.
3. `src/teams/team-role.guard.ts:23-26` composes `JwtAuthGuard` and `TeamRoleGuard` in that order.
4. `src/teams/team-role.guard.ts:44-53` reads the team route parameter and `request.user?.principalId`, rejects missing or malformed identifiers, then runs a parameterized query for the membership row matching both `team_id` and `user_id`.
5. `src/teams/team-role.guard.ts:54-56` returns `403` unless that live row's role is included in the required roles. For invitation creation, only `OWNER` or `ADMIN` passes; a valid authenticated caller who is a non-member or only a `MEMBER` cannot reach the service operation.

`ParseUUIDPipe` validates identifier syntax; by itself it does not prove team ownership. The live membership/role query is the authorization control that prevents a path-ID substitution from becoming an IDOR. At source level, the inspected route and guard contain this defense; this review did not execute the request against a running API.

## Remaining Verification Limits

- `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` returned `False` (`TCP connect ... failed`). The PostgreSQL-backed integration test could not be run in this environment.
- `src/teams/teams.collaboration.spec.ts:61` contains a member invitation request expecting `403`, but its result is not fresh runtime evidence while PostgreSQL is unreachable. The test also does not demonstrate a cross-team ID substitution with a principal who has a role in Team A but no membership in Team B.
- UPSK CLI `status --json` failed with a connection error (`timestamp_unix_ms: 1795343750528`, exit `1`). The checkpoint and any subsequent official prompt are not independently confirmed by the server.

## Recommended Focused Verification When the Test Database Is Available

Use the guarded `url_shortener_test` database and an authenticated principal who is an `OWNER` or `ADMIN` of Team A but has no membership in Team B. Submit `POST /teams/<team-B-uuid>/invitations` with a valid email and invitee ID. Assert `403 FORBIDDEN`, the exact shared error envelope, and that Team B gained no invitation, audit, or activity record. Then submit the same request for Team A and assert the authorized outcome. Do not substitute a malformed UUID for the cross-team case: that tests parsing, not IDOR authorization.

No files under `src/teams/` or `prisma/` were modified for this BREAK analysis.
