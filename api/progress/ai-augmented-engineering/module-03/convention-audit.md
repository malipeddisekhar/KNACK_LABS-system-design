# Module 3 VERIFY — Convention Audit of Raw First-Pass Outputs

**Scope:** Compared all three entries in `raw-first-pass-outputs.md` to their corresponding bundles, `system-context.md`, and the current NestJS/Prisma source conventions. The raw file remains unchanged. “Gap” means a required or useful detail is absent; “mismatch” means a proposed detail conflicts with a requirement or implementation constraint.

## Raw Output 1 — Create a Team and Its Owner Atomically

### Matches

1. Names `POST /teams`, matching `TeamsController`'s route.
2. Gets the caller from the current principal and proposes JWT protection, consistent with `JwtAuthGuard` and `CurrentPrincipal`.
3. Places Team creation, OWNER membership, and audit writing in a transaction, matching the required atomicity and `TeamsService` pattern.
4. Identifies success as `201` and blank-name failure as `400`, matching Nest's POST default and the service validation.
5. Reuses `TeamsService` SQL and the common exception filter rather than proposing a new persistence or error framework.

### Gaps / mismatches

- **Identity is underspecified:** “get the user from the current principal” should specify `principal.principalId`; `Principal` is exactly `{ principalId: string, username: string }`. Do not persist `username` as `user_id` or infer email.
- **Role type is informal:** `role OWNER` should name the existing `TeamRole` enum value `OWNER`; the audit target/action/outcome fields should align with `AuditLog` (`actorId`, `teamId`, `action`, `targetType`, `targetId`, `outcome`, `createdAt`).
- **HTTP coverage is incomplete:** the bundle calls for unauthenticated `401`, but the first pass only names `201` and `400`. It also does not state the common error JSON shape `{ "error": { "code", "message", "request_id" } }` or that `request_id` equals `X-Request-ID`.
- **File organization is loose:** “teams controller” and “TeamsService” identify the domain concept, but not the exact `src/teams/teams.controller.ts`, `src/teams/teams.service.ts`, and DTO paths. No contradiction is proposed; the first pass simply does not give a precise edit boundary.
- **Verification target is vague:** “teams tests” does not name the existing `src/teams/teams.collaboration.spec.ts` or database safety requirement. The bundle requires reporting focused tests and `git diff --check` and disclosing a blocked DB check.

## Raw Output 2 — Accept and Expire Team Invitations

### Matches

1. Calls for SHA-256 hashing of the presented token, consistent with the existing crypto dependency and invitation service pattern.
2. Calls for expired invitations to be marked expired and return `410`.
3. Groups invitation state change, membership creation, and audit recording in one transaction.
4. Treats a failed conditional status update as protection against a second use and uses conflict behavior for replay.
5. Reuses the existing JWT guard and proposes inspecting the DTO, migration, and transaction code rather than introducing a new auth or persistence package.

### Gaps / mismatches

- **Recipient binding is vague:** “belongs to that user” must explicitly mean stored `recipientUserId === principal.principalId`. The authenticated `Principal` has no email field; no username/email mapping may be invented. A null/unbound recipient must fail closed.
- **Lifecycle details are not exact:** name `TeamInvitationStatus.PENDING`, and compare database time with `expiresAt` (`expiresAt > now` for acceptance; `now >= expiresAt` must mark `EXPIRED`). The first pass only says “expired.”
- **Race at expiry is mishandled by the summary:** it says any conditional update with zero rows returns conflict. If the invitation crosses its expiry boundary after the initial read, the failed update must re-check/mark expiry and return `410`, not automatically collapse the case into `409`. A non-pending/replayed invitation remains `409`.
- **Route/file naming is incomplete:** specify `POST /teams/invitations/accept`, `src/teams/teams.controller.ts`, `src/teams/teams.service.ts`, and `src/teams/dto/accept-team-invitation.dto.ts`; “accept route” alone is ambiguous.
- **Status/error contract is incomplete:** the bundle expects success `201`, recipient mismatch `403`, missing token `404`, expiry `410`, and replay/non-pending `409`. The first pass names only `410` and generic conflict, and omits the shared error-envelope fields.
- **Audit details are loose:** “audit row” should identify actor/team/action/target/outcome/time fields and confirm no raw token is stored or logged.

## Raw Output 3 — Ordered Team Activity Feed

### Matches

1. Identifies an `ActivityEvent` model/table and a per-team sequence.
2. Describes cursor-based reads returning later events in ascending order.
3. Requires member access and `403` for non-members, matching `@RequireTeamRoles('OWNER', 'ADMIN', 'MEMBER')` and the live DB role guard.
4. Places event creation in the same transaction as the change that emitted it.
5. Includes a migration and reconnect test, matching the Prisma/migration/Jest project layout.

### Gaps / mismatches

- **Concurrency bug (substantive mismatch):** selecting `MAX(sequence)+1` is not safe under concurrent writes. Two transactions can observe the same maximum and allocate the same next value; a unique constraint would then fail one write, while removing that constraint risks duplicate cursors. The current design uses a per-team `BIGINT activitySequence` row updated atomically (`UPDATE teams ... RETURNING activity_sequence`) and inserts the event in the same transaction. Do not use `MAX()+1`.
- **Cursor contract is underspecified:** give the exact route `GET /teams/:id/activity?afterSeq=N`, validate `afterSeq` as a non-negative integer within PostgreSQL BIGINT range (`400` if invalid), query `sequence > N`, and return the BIGINT sequence as a string to avoid JavaScript precision loss. Defaulting to zero when omitted is consistent.
- **Success/error responses are incomplete:** specify `200` for members, `403` for non-members, and the common error envelope. The first pass only states `403`.
- **Persistence naming is informal:** the Prisma model is `ActivityEvent`, mapped to table `activity_events`; its sequence is `BigInt`, with a unique `(teamId, sequence)` constraint. “ActivityEvent table” is understandable but should distinguish model from mapped table in an implementation prompt.
- **File organization is incomplete:** name `prisma/schema.prisma`, a timestamped migration directory, `src/teams/teams.controller.ts`, and `src/teams/teams.service.ts`, rather than just “add a migration” and “the endpoint.”

## Cross-Cutting Convention Audit

| Area | Matches across outputs | Gaps or conflicts |
|---|---|---|
| **Naming** | Output 1 uses the `/teams` route; Output 3 names `ActivityEvent`; all use understandable feature concepts. | Principal identity, enum/model names, route paths, and exact source paths are often described loosely rather than as the existing types and filenames. |
| **Error handling / HTTP** | Output 1 includes 201/400; Output 2 includes 410/conflict; Output 3 includes 403. | None shows the exact error envelope or `request_id` contract. Outputs 1–3 omit some required statuses as listed above; Output 2's generic zero-row conflict can misclassify an expiry race. |
| **Imports / dependencies** | No output proposes a new package, alternate auth system, or custom error framework; all refer to existing JWT, service, or transaction patterns. | No output states the existing TypeScript `.js` import convention or explicitly says to preserve current imports/dependencies. This is a prompt-detail omission, not a conflicting import proposal. |
| **File organization** | Outputs 1 and 2 distinguish controller/service responsibilities; Output 3 identifies migration and test work. | Exact Nest feature paths and DTO/model/migration locations are not consistently named, making the edit scope less precise than the context bundles. |

**Conclusion:** The first passes generally selected the right framework components and transactional boundaries. The most dangerous mismatch is Raw Output 3's `MAX(sequence)+1`; the most important security gap is Raw Output 2's unspecified recipient binding. The other findings are precision gaps around concrete identity/type names, response contracts, and exact file scope—not evidence that the raw outputs were executed or verified.
