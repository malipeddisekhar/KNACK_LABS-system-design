# Module 04 — BUILD: Critical Review Pass

## Scope, Inventory, and Verification Boundary

### Existing team-related files

- **Team implementation:** `src/teams/teams.controller.ts`, `src/teams/teams.service.ts`, `src/teams/team-role.guard.ts`, `src/teams/teams.module.ts`.
- **DTOs:** `src/teams/dto/create-team.dto.ts`, `create-team-invitation.dto.ts`, `accept-team-invitation.dto.ts`, and `create-team-comment.dto.ts`.
- **Tests/support:** `src/teams/teams.collaboration.spec.ts`, `src/database/prisma.service.ts`, plus `src/auth/auth.types.ts`, `current-principal.decorator.ts`, `jwt-auth.guard.ts`, `src/common/error-envelope.ts`, and `src/common/http-exception.filter.ts`.
- **Prisma schema:** `prisma/schema.prisma` and `prisma/migrations/migration_lock.toml`.
- **Team migrations:** `20261122120000_team_collaboration_models/migration.sql`, `20261122121000_team_invitations/migration.sql`, `20261122122000_team_invitation_recipient_binding/migration.sql`, `20261122123000_team_activity_events/migration.sql`, and `20261122124000_team_comments/migration.sql`.
- **Other migrations present:** `20261108063350_init`, `20261112120000_module4_principal_ownership`, `20261114060000_module7_click_event_idempotency`, and `20261114070000_module8_links_long_url_fts_gin_index`.
- **Module 3 review inputs:** `raw-first-pass-outputs.md`, `convention-audit.md`, `convention-violation.md`, `context-fix-verification.md`, `context-triangle.md`, `system-context.md`, and `task-context-bundles.md` under `progress/ai-augmented-engineering/module-03/`.

`upsk status --json` failed with `Cannot reach UPSK server at api.upsk.to (connection; source: --api-url)` (`timestamp_unix_ms: 1795342917014`, exit `1`). The read-only local TCP check for `127.0.0.1:5432` returned `False`; no database-backed test or migration was run for this review. Findings below distinguish source-level observations from unverified runtime behavior. No files under `src/teams/` or `prisma/` were edited.

## Five-Category Critical Review

### Security

| Severity | Finding | Concrete evidence and scenario | Assessment |
|---|---|---|---|
| **critical** | The exercise sample's stated SQL-injection, cross-team IDOR, and raw-token logging patterns would permit data access or invitation abuse if present. | The exercise review brief lists these sample risks in `progress/ai-augmented-engineering/module-04/five-failure-categories.md:25-28`. The separate sample snippet was not available locally, so this is a review of the described sample, not a line-level finding against the repo. | The current route has a live owner/admin guard and UUID parsing (`src/teams/teams.controller.ts:76-84`); the guard binds `teamId` and `request.user.principalId` in parameterized SQL (`src/teams/team-role.guard.ts:44-55`). Invitation SQL uses `Prisma.sql` and stores a SHA-256 hash (`src/teams/teams.service.ts:69-86`); no raw-token logging appears in that method. These controls mitigate the sample patterns in the inspected path. |
| **medium** | Recipient identity and delivery email can be supplied independently. | `inviteeUserId` is optional (`src/teams/dto/create-team-invitation.dto.ts:12-16`), and `createInvitation` stores it beside `invitedEmail` without checking an authoritative email-to-principal association (`src/teams/teams.service.ts:75-85`; `prisma/schema.prisma:73-80`). | A mistaken or mismatched pair can create an invitation addressed to one email but redeemable only by another principal. The principal is `{ principalId, username }`; no verified email lookup is in this contract. This is a trust-boundary/product correctness gap, not evidence of an external SQL/IDOR exploit. |
| **low** | The raw invite token is included in the successful create response and no test checks application/proxy logs. | `src/teams/teams.service.ts:95` returns `{ ...invitation, token }`; the integration test checks audit response contents do not contain the token (`src/teams/teams.collaboration.spec.ts:55-58`) but does not inspect logs. | One-time token return may be necessary for delivery, and no log leak was observed in the inspected method. Keep the response narrowly scoped and verify request/response logging does not persist the token. |

### Edge Cases

| Severity | Finding | Concrete evidence and scenario | Assessment |
|---|---|---|---|
| **high** | The DTO permits an invitation without `inviteeUserId`, but acceptance fails closed when no recipient principal is bound. | The DTO marks `inviteeUserId` optional (`src/teams/dto/create-team-invitation.dto.ts:12-16`); creation stores `NULL` when omitted (`src/teams/teams.service.ts:83-86`); acceptance rejects a null recipient (`src/teams/teams.service.ts:138-140`). | The API can return `201` for an invitation that no principal can redeem. Require an explicit recipient identity before insertion or define a separate, secure recipient-binding flow; do not infer email from username. |
| **medium** | Existing-member check can race with membership creation. | `createInvitation` checks `team_members` then inserts the pending invitation (`src/teams/teams.service.ts:74-89`). Acceptance creates membership later with `ON CONFLICT DO NOTHING` and returns conflict if it already exists (`src/teams/teams.service.ts:162-167`). | A concurrent membership write can occur after the check and before invite insert. No cross-table constraint prevents a now-member from retaining a pending invite. This is a source-level race possibility; it was not reproduced without PostgreSQL. |
| **medium** | The exercise sample's missing UUID/email/role, duplicate, existing-member, and self-invite cases would leave invalid or unusable invitations. | The sample risk list is recorded in `five-failure-categories.md:31-34`. Current code parses route UUIDs (`teams.controller.ts:79`), validates email and role (`create-team-invitation.dto.ts:4-16`), checks a provided invitee ID for membership (`teams.service.ts:75-82`), and uses the partial unique pending constraint (`schema.prisma:87`; service `83-89`). | Basic validation and duplicate protection exist. A self-invite with an explicit ID is caught as existing membership, but there is no dedicated self-invite test or policy; without an ID, the service cannot compare the email to the principal. |

### Error Handling

| Severity | Finding | Concrete evidence and scenario | Assessment |
|---|---|---|---|
| **high** | The exercise sample's swallowed errors or writes outside a transaction could hide failures and leave an invitation without its audit/activity record. | This is one of the specified sample failure modes (`five-failure-categories.md:38-40`). In the repo, invitation insert, audit insert, and activity emission execute inside one Prisma transaction (`teams.service.ts:74-96`), with no local catch in `createInvitation`. | The inspected implementation has the needed rollback boundary; a failure in a later write rejects the transaction rather than committing a partial invitation. Runtime rollback behavior still needs a database-backed failure-injection test. |
| **medium** | The integration test checks status codes but not the shared error body or request-ID correlation. | For example, duplicate/replay/expiry assertions use `.expect(409)` / `.expect(410)` (`teams.collaboration.spec.ts:43-50`) without asserting `{ error: { code, message, request_id } }` or matching `X-Request-ID`. The contract is defined in `src/common/error-envelope.ts:7-15` and `src/common/http-exception.filter.ts:88-96,104-117`. | A status can be correct while the client contract is wrong. Add exact body keys, stable codes, and header equality assertions. |

### Naming & Abstractions

| Severity | Finding | Concrete evidence and scenario | Assessment |
|---|---|---|---|
| **medium** | The exercise sample's overloaded handler, vague data names, `SELECT *`, or direct row serialization could mix authorization, persistence, and response-only concerns or expose internal fields. | These risks are specified in `five-failure-categories.md:43-49`; the sample text itself is unavailable locally. | In the current repo, names such as `actorId`, `invitedEmail`, and `tokenHash` are explicit, the invitation row uses a typed projection, and SQL returns a fixed column list (`teams.service.ts:20-28,64-95`). No `SELECT *` was found in the reviewed invitation path. `createInvitation` has an inferred return type and returns the one-time token with metadata (`:64-68,95`), so a named response DTO would make the secret boundary clearer. |
| **low** | The single collaboration test groups many invariants in one broad test case. | `teams.collaboration.spec.ts:33-73` has one `it` covering roles, invite lifecycle, comments, mentions, activity, and audit reads. | Failure localization is weaker than separate focused cases. The code is not incorrect on this evidence; split tests when expanding coverage. |

### Tests

| Severity | Finding | Concrete evidence and scenario | Assessment |
|---|---|---|---|
| **high** | A mock-only happy-path sample would not prove database constraints, transaction rollback, guard behavior, or race handling. | The exercise risk is recorded in `five-failure-categories.md:51-53`. The repository spec is integration-style: it builds `AppModule`, uses Supertest, and queries `PrismaService` (`teams.collaboration.spec.ts:8-20`); it is not the mock-only sample. | The real spec covers duplicate invite, wrong recipient, acceptance, replay, pre-expired invite, role rejection, and audit token exclusion (`:42-61`), but this run was not executed because local PostgreSQL port 5432 was unreachable. |
| **high** | Important negative and concurrent cases are absent from the current integration spec. | The existing spec has no explicit invalid UUID/email/role, missing-auth, self-invite, duplicate-creation concurrency, transaction rollback injection, or error-envelope/request-ID assertions (`teams.collaboration.spec.ts:33-73`). | Without a working `url_shortener_test` database, neither the current cases nor proposed additions have fresh runtime proof. Do not treat source inspection as a passing test. |

## Module 3 Context Engineering Findings

| Artifact | Evidence | Critical-review implication |
|---|---|---|
| `raw-first-pass-outputs.md:11` | Raw Output 2 says every zero-row acceptance update returns “conflict”; `:15` proposes `MAX(sequence)+1`. | These are real prompt-output divergences: expiry must remain distinct from replay, and per-team sequence allocation must be atomic. |
| `context-fix-verification.md:7-10,47-49` | Records the envelope/status/expiry/sequence gaps and says its pass verifies the context package, not regenerated answers. | Keep prompt repair and answer/runtime verification as separate evidence types. |
| `system-context.md:58-78`; `task-context-bundles.md:60-62,88-92` | Now require exact error-envelope assertions, `X-Request-ID` equality, the `410`/`409` branch distinction, and the schema-backed atomic activity counter. | Context is more precise, but a future output and test run still need to demonstrate compliance. |
| `teams.service.ts:257-269`; `schema.prisma:24-28,93-105` | Current activity writer increments `Team.activitySequence` and inserts `ActivityEvent` in the same transaction; the schema has unique `(teamId, sequence)`. | The earlier `MAX(sequence)+1` concern is addressed in the current source path; no concurrent runtime proof was performed here. |

## FIX LIST -- Priority Order

1. **High — Make invitation recipient binding usable and explicit.** Reconcile optional `inviteeUserId` with acceptance's fail-closed check so creation cannot produce a `201` invitation that nobody can redeem; preserve the rule that email is not inferred from username.
2. **High — Test and close the member-check/invitation race.** Serialize invitation creation against acceptance/membership creation, or use an equivalent database-safe mechanism, so a member cannot be left with an active pending invitation after a concurrent membership write.
3. **High — Assert the HTTP error contract and broaden negative tests.** Verify exact envelope keys, stable status code, and `X-Request-ID` equality; cover invalid input, authorization, conflicts, and expiry.
4. **Medium — Prove token handling end to end.** Keep the token hash-only at rest, ensure the raw token is returned only through the intended one-time response, and verify application/proxy/audit logs never contain it.
5. **Medium — Add failure-injection and transactional rollback coverage.** Force audit/activity insertion to fail and assert invitation state rolls back with no partial records.
6. **Low — Improve reviewability.** Give `createInvitation` an explicit safe response type and split the large collaboration test into focused cases.
7. **Low — Keep sample-vs-repository findings distinct.** The sample's SQL injection/IDOR/logging/select-star issues are serious if present, but the inspected repository path uses guards, parameterized SQL, explicit projections, and token hashing; do not copy sample defects into the repo review as observed facts.

## Three Surgical Follow-Up Prompts

### Prompt 1 — Recipient binding cannot create unusable invites

> Inspect `src/teams/dto/create-team-invitation.dto.ts`, `TeamsService.createInvitation`, and `TeamsService.acceptInvitation`. Make the invitation contract internally consistent: a successful create must always establish the exact `recipientUserId` that can accept it, and an invitation without that binding must be rejected before inserting any row (unless an explicit, separately supported recipient-binding flow is implemented). Do not infer email from `{ principalId, username }` or invent an email lookup. Do not rewrite whole files or leave `// TODO` placeholders. Verify with tests that a missing recipient binding returns `400` with no invitation/audit/activity rows, while a correctly bound recipient can accept once and a different principal gets `403`.

### Prompt 2 — Serialize invitation creation against membership changes

> Inspect `TeamsService.createInvitation`, `TeamsService.acceptInvitation`, and every current `team_members` insertion path in `src/teams/teams.service.ts`. Add one consistent database serialization strategy for the per-team existing-member check and invitation/member transition, using a deterministic lock order or an equivalent database-safe primitive. A completed operation must not leave a `PENDING` invitation for a user who became a member concurrently; duplicate active invitations must still resolve to one `409`, and successful membership/invitation/audit/activity changes must remain atomic. Do not change unrelated modules, use unparameterized SQL, rewrite whole files, or leave TODOs. Verify with a PostgreSQL integration test that races invite creation against membership acceptance and asserts final membership/invitation state plus audit/activity consistency.

### Prompt 3 — Test the public error contract and meaningful failure paths

> Extend `src/teams/teams.collaboration.spec.ts` with focused cases for `POST /teams/:id/invitations` and invitation acceptance. For every error, assert the HTTP status, exact `{ error: { code, message, request_id } }` shape with no extra keys, and `response.body.error.request_id === response.headers['x-request-id']`. Cover invalid UUID/email/role (`400`), missing auth (`401`), insufficient live role or recipient mismatch (`403`), missing invitation (`404`), duplicate/replay (`409`), and expired invitation (`410`). Add a log-capture assertion that no raw token is logged and a transaction rollback case for audit/activity failure. Do not weaken `TEST_DATABASE_URL` safety or rewrite the suite wholesale. Run the focused integration suite against the guarded `url_shortener_test` database and report the exact result; do not claim a pass if PostgreSQL remains unavailable.
