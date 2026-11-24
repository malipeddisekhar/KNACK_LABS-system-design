# Module 3 — Task Context Bundles

These three bundles are drawn from the Module 2 Team Collaboration task plan. Each one gives an AI the smallest useful source set, states why files matter and what goes wrong if omitted, and fixes the output shape before implementation begins. They are prompt packages only; this artifact does not modify application code.

## Bundle 1 — Task 3: Create a Team and Its Owner Atomically

**Goal:** `POST /teams` creates a Team, creates the caller's OWNER membership, and writes a TEAM_CREATED audit record atomically. Validate the team name and preserve the existing HTTP/error contract.

### Files to read

| File | Reason | If omitted |
|---|---|---|
| `src/teams/teams.controller.ts` | Shows current route/decorator conventions and principal extraction. | The route may duplicate behavior or use the wrong identity/HTTP pattern. |
| `src/teams/teams.service.ts` | Shows existing transaction, UUID, parameterized SQL, audit, and error patterns. | The related writes may not be atomic or may diverge from service conventions. |
| `src/teams/teams.module.ts`, `src/app.module.ts` | Confirm provider wiring and application registration. | The endpoint may be implemented but unreachable or dependency injection may fail. |
| `src/teams/dto/create-team.dto.ts` | Establishes team-name validation and limits. | Validation could accept blank/oversized values or reject valid input inconsistently. |
| `src/auth/auth.types.ts`, `current-principal.decorator.ts`, `jwt-auth.guard.ts` | Confirm identity is `{ principalId, username }` and how authentication is enforced. | The creator could be assigned using an invented identifier or route could be unauthenticated. |
| `prisma/schema.prisma` (Team, TeamMember, AuditLog only) | Confirms names, mapped columns, role values, and relationships. | SQL may target nonexistent fields or fail to represent the intended owner/audit state. |
| `src/database/prisma.service.ts` | Confirms PostgreSQL adapter and Prisma transaction support. | Connection assumptions or transaction usage may conflict with the app setup. |
| `src/common/error-envelope.ts`, `http-exception.filter.ts` | Establish the shared error body and status-to-code mapping. | Clients could receive an inconsistent error shape or leaked internal details. |

### Files to modify

`src/teams/teams.controller.ts`, `src/teams/teams.service.ts`, and `src/teams/dto/create-team.dto.ts` only if a required DTO correction is needed. Touch `src/teams/teams.module.ts` or `src/app.module.ts` only if inspection proves route/provider registration is missing. Do not edit auth, unrelated feature modules, `.env`, or generated files.

### Expected output format

1. One-sentence implementation summary.
2. Changed-file table with purpose and added/deleted line counts (total <=150).
3. Exact route request/response and status behavior: `201`, invalid name `400`, unauthenticated `401`.
4. For each error, assert the exact `{ error: { code, message, request_id } }` shape (no extra keys) and that `body.error.request_id` equals the `X-Request-ID` response header; cover `400 BAD_REQUEST` and `401 UNAUTHORIZED`, not only status codes.
5. Evidence that Team, OWNER membership, and audit row are in one transaction.
6. Focused test command/result and `git diff --check`; clearly state when DB access blocks verification.

## Bundle 2 — Task 5: Accept and Expire Team Invitations

**Goal:** Authenticated, intended recipients accept unexpired PENDING invitations once; expiry is marked and rejected; replay or competing acceptance cannot create duplicate membership or audit/activity effects.

### Files to read

| File | Reason | If omitted |
|---|---|---|
| `src/teams/teams.controller.ts`, `teams.service.ts` | Show the current invitation routes, token hashing, transaction style, conflict statuses, and shared activity helper. | Acceptance could fork lifecycle rules or omit transactionally related effects. |
| `src/teams/dto/accept-team-invitation.dto.ts` | Establish token input validation. | Empty, malformed, or oversized tokens may reach lookup logic. |
| `prisma/schema.prisma` (TeamInvitation, TeamMember, AuditLog, TeamRole, TeamInvitationStatus) | Confirm recipient binding, status enum, expiry, unique membership, and audit fields. | Recipient checks, conditional state updates, or membership inserts may use the wrong contract. |
| Relevant invitation/recipient-binding migrations under `prisma/migrations/` | Confirm actual SQL column names/defaults and migration state expectations. | Code may depend on a column not present in the database. |
| `src/auth/auth.types.ts`, `current-principal.decorator.ts`, `jwt-auth.guard.ts` | Confirm caller identity and authentication behavior. | Code might invent an email-to-user mapping or accept an unbound token. |
| `src/database/prisma.service.ts` | Confirm transaction and PostgreSQL connection handling. | Concurrency behavior may be incorrectly assumed. |
| Common error envelope/filter | Confirm `401`, `403`, `404`, `409`, and `410` responses. | Clients may receive inconsistent failure contracts. |
| `src/teams/teams.collaboration.spec.ts`, `test/setup-test-db.ts` | Identify lifecycle coverage and the test-only DB safety guard. | Replay/expiry cases may remain uncovered or tests may target an unsafe database. |

### Files to modify

`src/teams/teams.controller.ts`, `src/teams/teams.service.ts`, and `src/teams/dto/accept-team-invitation.dto.ts`. Update `prisma/schema.prisma` plus a migration only if the required recipient/status field is genuinely missing after inspection. No auth, unrelated module, `.env`, generated-client, or dependency edits.

### Expected output format

1. State the identity binding explicitly: `recipientUserId` must equal authenticated `principalId`; no email is inferred.
2. Describe SHA-256 token lookup, database-time expiry, conditional PENDING transition, and transaction boundaries.
3. Give a compact behavior matrix: valid first acceptance `201`; wrong recipient `403`; missing invitation `404`; expired invitation `410` and status becomes `EXPIRED`; replay/already accepted, revoked, or otherwise non-pending `409`.
4. Handle the expiry boundary after the initial read: if the conditional `PENDING` -> `ACCEPTED` update affects zero rows, re-read/classify current state using database time. If it is still `PENDING` and `now >= expiresAt`, atomically mark it `EXPIRED` and return `410 GONE`; return `409 CONFLICT` only for a competing acceptance or another non-pending state. Do not collapse every zero-row update into `409`.
5. For every error status, assert the exact `{ error: { code, message, request_id } }` body with no extra keys and `body.error.request_id === X-Request-ID`; specifically map `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, and `410 GONE`. Assert successful first acceptance separately as `201`.
6. Show changed files/line counts (<=150), test cases and results, and migration status; never print raw token values.

## Bundle 3 — Task 6: Ordered Team Activity Feed

**Goal:** Add activity persistence and `GET /teams/:id/activity?afterSeq=N` so authorized members reconnect using a per-team strictly increasing cursor, with no gaps/duplicates from concurrent committed writes.

### Files to read

| File | Reason | If omitted |
|---|---|---|
| `src/teams/teams.controller.ts`, `teams.service.ts` | Identify current routes, transaction clients, activity emission call sites, and query conventions. | The endpoint may duplicate helpers or sequence allocation may not be atomic with mutations. |
| `src/teams/team-role.guard.ts` | Confirm active member authorization and team route parameter lookup. | Non-members could read team activity or valid members could be blocked. |
| `src/teams/teams.module.ts`, `src/app.module.ts` | Confirm controller/provider and module registration. | The route/provider may not be activated. |
| `prisma/schema.prisma` (Team, ActivityEvent, membership) | Confirm sequence type, team relation, uniqueness, and field mappings. | Cursor type/constraints may not match PostgreSQL or Prisma. |
| Latest team/activity migration SQL | Match timestamp folder naming and ensure a unique `(team_id, sequence)` database constraint. | Concurrent requests may allocate duplicate sequence numbers or migrations may not match schema. |
| `src/database/prisma.service.ts` | Confirm PostgreSQL and transaction support. | Sequence strategy could depend on unsupported behavior. |
| Common error envelope/filter | Define invalid cursor and authorization response contract. | Invalid cursor may fail unpredictably or leak database errors. |
| `src/teams/teams.collaboration.spec.ts`, test setup | Find cursor/order assertions and safe test DB requirements. | Gaps, duplicates, or test environment issues may go unnoticed. |

### Files to modify

`prisma/schema.prisma`, a timestamped migration under `prisma/migrations/`, `src/teams/teams.controller.ts`, and `src/teams/teams.service.ts`; modify the existing collaboration spec only if the task explicitly includes tests. Avoid unrelated modules and generated files.

### Expected output format

1. State how a sequence is allocated atomically per team (for example, updating a team sequence row and inserting the event in the same transaction); do not use an unprotected `MAX(sequence)+1`.
2. State cursor parsing (`afterSeq` is a non-negative integer), `sequence > afterSeq`, ascending order, and member authorization.
3. Allocate sequence from the existing `Team.activitySequence` counter with one atomic increment and insert the `ActivityEvent` in the same transaction; schema evidence is `ActivityEvent.sequence BigInt` with unique `(teamId, sequence)`. Do not use unprotected `MAX(sequence) + 1`.
4. List the activity types emitted by this task and their transaction coupling.
5. Assert the complete route matrix: member read `200`; non-member `403 FORBIDDEN`; unauthenticated `401 UNAUTHORIZED`; invalid cursor `400 BAD_REQUEST`. Every error assertion must verify exactly `{ error: { code, message, request_id } }` and `body.error.request_id === X-Request-ID`.
6. Report schema/migration alignment, changed files and line counts (<=150), focused cursor/concurrency results, `git diff --check`, and whether the migration was applied.
