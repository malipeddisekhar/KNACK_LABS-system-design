# Module 04 — CONTEXT: Five Systematic AI Failure Categories

## Scope and Evidence Boundary

This review grounds the categories in the Team Collaboration API: NestJS routes under `src/teams/`, the `TeamInvitation`/`TeamMember` models in `prisma/schema.prisma`, the authenticated principal `{ principalId, username }`, and the shared error contract in `src/common/error-envelope.ts` / `src/common/http-exception.filter.ts`.

The live UPSK status request failed with a connection error (`timestamp_unix_ms: 1795342550504`, exit `1`), and the exercise's separate sample handler/test text was not present in the local progress files. The critical review below addresses the sample failure modes specified for this exercise; it does not treat those as defects in the current repository implementation. The actual `TeamsService.createInvitation` uses parameterized `Prisma.sql` and a transaction, and the existing collaboration spec is an integration-style test rather than a mock-only sample. Its runtime status is not re-tested here.

## Five Systematic AI Failure Categories

| Category | What it means in this API | Review questions |
|---|---|---|
| **Security** | Generated code can cross team boundaries, trust caller-supplied identity, construct unsafe SQL, or expose invitation secrets. | Are values parameterized? Does a live role guard authorize the `teamId`? Is the actor `principal.principalId`? Are tokens hashed and excluded from logs and ordinary response fields? |
| **Edge cases** | Plausible happy-path code misses invalid identifiers, lifecycle boundaries, duplicates, or identity corner cases. | Are route UUIDs and DTO fields validated? What happens for an existing member, duplicate pending invite, self-invite, malformed email, or concurrent duplicate request? |
| **Error handling** | Errors are swallowed, mislabeled, or leave partially committed state. | Do invitation, audit, and activity writes share a transaction? Are expected conflicts distinct from unexpected failures? Does the common filter preserve the error envelope? |
| **Naming & abstractions** | Vague names or overly broad abstractions hide identity and data boundaries. Broad selects or returning ORM rows can expose fields that callers do not need. | Do names distinguish actor, recipient, raw token, and token hash? Are only required columns selected and safe fields returned? Is the handler coordinating a clear use case rather than mixing unrelated responsibilities? |
| **Test coverage** | A test suite can make a feature look proven while exercising only mocks and one success path. | Do tests cover authorization, invalid input, duplicates, rollback, token secrecy, concurrency, and the real persistence constraints? Is the test database safe and reachable? |

## Critical Review of the Exercise Sample

The following review treats the sample as the intentionally flawed handler/test described by the exercise requirements. The listed issues are failure modes to catch, not assertions that the current repository has those same defects.

### 1. Security

- **SQL injection:** If the sample interpolates `teamId`, email, or role into SQL text, a crafted value can change the query or write beyond the intended row. Use parameterized `Prisma.sql` values and validate the enum/identifier before persistence.
- **IDOR / cross-team access:** A valid invitation ID or `teamId` is not proof of authorization. If the handler trusts a request-body actor ID or skips a live owner/admin check for the path team, a member of one team could create invitations against another. Use the authenticated `principal.principalId` and `RequireTeamRoles('OWNER', 'ADMIN')` / live `TeamRoleGuard` check for that exact team.
- **Log leakage:** Logging the raw token, full DTO, authorization header, or database row can make an otherwise single-use secret reusable by anyone with log access. Persist only the SHA-256 token hash; never log the raw token or credentials; return only explicitly approved invitation metadata and, if the flow needs it, expose the raw token once at creation.

### 2. Edge Cases

- **Missing validation:** Validate `:id` as a UUID (`ParseUUIDPipe`), validate and normalize the invite email, bound its length, and restrict role values. A malformed identifier should produce `400 BAD_REQUEST`, not a database cast error that becomes a `500`.
- **Existing member / duplicate pending invite:** Check membership when a recipient principal ID is available, and enforce the partial unique pending-invitation constraint for `(teamId, invitedEmail)` in PostgreSQL. The database constraint must resolve concurrent requests; a prior read alone cannot prevent a race. Return a deliberate `409 CONFLICT` for a member or duplicate pending invite.
- **Self-invite and identity ambiguity:** Define the self-invite policy explicitly and compare the authenticated `principalId` to an explicitly bound `inviteeUserId` when present. The principal is `{ principalId, username }`; do not invent an email lookup or treat a username as an email.
- **Other boundaries:** Reject blank/invalid email, unknown roles, deleted/nonexistent teams, and missing/invalid credentials through the documented status contract. Normalize email consistently before both duplicate checks and insert.

### 3. Error Handling and Atomicity

- A broad `catch` that converts every failure into a generic success, `409`, or hand-built error hides the cause and prevents clients from distinguishing invalid input, forbidden access, conflict, and server failure.
- If invitation insertion commits before audit/activity recording and either later write fails, the system can contain an active invitation with no incident record or activity event. Put invitation, audit, and activity writes in one transaction; let failure roll all of them back.
- Preserve the common filtered response shape exactly as `{ error: { code, message, request_id } }`, with `request_id` equal to `X-Request-ID`. Expected failures map to their stable status/code (`400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`); unexpected errors remain generic `500 INTERNAL_SERVER_ERROR` responses with details kept server-side.

### 4. Naming, Abstractions, and Data Exposure

- Generic names such as `data`, `user`, `token`, or `result` can blur whether a value is the actor, recipient, raw token, or stored hash. Prefer explicit names such as `actorId`, `recipientUserId`, `rawInviteToken`, and `tokenHash`.
- A single overloaded handler that parses input, decides authorization, generates secrets, writes multiple records, sends notifications, and formats internal rows is difficult to review and makes rollback boundaries unclear. Keep the use-case orchestration clear and delegate only cohesive responsibilities.
- `SELECT *` or returning the full Prisma/database row risks exposing `token_hash`, recipient identifiers, internal timestamps, or fields added later. Select an explicit field list and construct a safe response DTO; never serialize a raw database row by default.
- Keep audit metadata purposeful and sanitized. Record who performed the action, on which team and invitation, and the outcome; do not copy credentials or raw tokens into metadata.

### 5. Test Coverage

A mock-only happy-path test proves only that mocked calls were made for one successful case. It cannot establish parameterized SQL behavior, database uniqueness under concurrent inserts, transaction rollback when audit/activity fails, actual route guards, DTO/UUID validation, or the global error-filter response.

The sample should be supplemented with focused unit tests and database-backed HTTP integration cases for: authenticated owner/admin success; member/non-member `403`; missing/invalid auth `401`; malformed UUID and invalid email/role `400`; existing-member and duplicate-pending `409`; self-invite policy; concurrent duplicate creation; transaction rollback on audit/activity failure; exact envelope and request-ID equality; and confirmation that neither logs nor ordinary output contain the raw token. Run database tests only through the guarded test setup using `TEST_DATABASE_URL` with database name `url_shortener_test`.

## Repository Cross-Check (Separate from the Flawed Sample)

- `src/teams/teams.controller.ts` applies the live owner/admin role decorator to invitation creation, parses the team path as a UUID, and passes `principal.principalId` to the service.
- `src/teams/dto/create-team-invitation.dto.ts` validates email, role, and optional invitee user ID.
- `src/teams/teams.service.ts` normalizes the email, hashes a high-entropy token, uses parameterized SQL, relies on the partial pending-invite unique constraint, and writes invitation/audit/activity within a Prisma transaction.
- `prisma/schema.prisma` stores `tokenHash` uniquely, records explicit `recipientUserId`, defines invitation lifecycle status and expiry, and enforces one pending invite per team/email.
- `src/common/error-envelope.ts` and `src/common/http-exception.filter.ts` define the exact three-field error envelope, stable HTTP status mapping, request-ID correlation, and generic client message for unexpected 5xx failures.
- `src/teams/teams.collaboration.spec.ts` includes integration scenarios for duplicate creation, recipient mismatch, successful acceptance, replay, expiry, and member authorization. A test file's presence is not a passing runtime result; the prior database connection block remains the verification boundary unless the suite is run successfully against the guarded test database.
