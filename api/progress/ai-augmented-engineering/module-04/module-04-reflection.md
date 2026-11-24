# Module 04 — Critical Review Reflection

## Review Strategy and Decision Callback

I used the Option B pattern-based review across Security, Edge Cases, Error Handling, Naming, and Tests, then inspected the highest-risk authorization, mutation, and transaction paths line by line. The five-category pass gave broad coverage; tracing the invitation route into its guard and service checked whether the most serious security claims matched the implementation. This combination costs more time than a quick AI summary, but it makes review findings easier to prioritize and ties them to exact code evidence.

AI reviewing AI can repeat the same training-data blind spots as the code it reviews. A plausible-looking authorization check may trust a global role or a UUID without binding the authenticated principal to the requested team. I treated AI findings as hypotheses, then checked the actual controller, guard, service, tests, and environment rather than treating a second model response as independent proof.

## IDOR Review: Source Evidence and Runtime Boundary

The invitation route in `src/teams/teams.controller.ts` applies `RequireTeamRoles('OWNER', 'ADMIN')`, parses the team path value with `ParseUUIDPipe`, and passes `principal.principalId` from the authenticated `{ principalId, username }` principal to the service. `src/teams/team-role.guard.ts` reads the current principal and requested team, runs parameterized SQL against `team_members` scoped by both `team_id` and `user_id`, and permits only the roles required by the route. These are concrete source-level controls against cross-team invitation creation; a TODO, a hard-coded identity, or a UUID-format check alone would not provide that authorization.

`src/teams/teams.service.ts` uses parameterized Prisma SQL and a Prisma transaction for invitation, audit, and activity writes. That transaction is source evidence for atomic intent, not proof of database behavior under failure or concurrency. PostgreSQL at `127.0.0.1:5432` was unreachable, so the Admin/Owner `201 Created` and non-admin/non-member `403 Forbidden` cases remain **NOT EXECUTED**; the source review predicts those outcomes but does not claim live HTTP results.

## Review Trade-offs and Verification

Pattern-based review helps catch repeated failure classes across a feature, while line-by-line inspection is more effective for a narrow, high-impact path such as team-scoped authorization. Broad review alone can leave a subtle identity-to-object mismatch hidden; deep inspection of every line is expensive and can lose the overall risk picture. I used the broad pass to select the risky path, then followed its identity, team scope, database query, and writes.

The reproducible check ran `git diff --check` and an existence/trailing-whitespace scan for `review-pass.md`, `edge-case-verification.md`, `idor-break-analysis.md`, and `idor-fix-verification.md`. It exited `0`; all four files were present and the scan found `0` trailing-whitespace lines. Git printed a CRLF-to-LF normalization warning for `src/app.module.ts`; that warning did not fail the check. PostgreSQL reachability had previously returned `False`, so database-backed status assertions and integration tests are not represented as passing evidence.

## Risk and Mitigation

**Risk:** Reviewers may mistake static source inspection for proof that a live database-backed request returns the expected status or creates no records after denial. **Mitigation:** Keep those cases explicitly marked `NOT EXECUTED` until the guarded `url_shortener_test` database is reachable; then run one authorized `OWNER`/`ADMIN` request and one denied member/non-member request, assert `201` and `403`, and verify the denied request produced no invitation, audit, or activity writes.
