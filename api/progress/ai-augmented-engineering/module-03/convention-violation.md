# Module 3 — BREAK: Convention Violation Review

## Scope and source contract

Compared the three unedited first-pass outputs in `raw-first-pass-outputs.md` with `src/common/error-envelope.ts`, `src/common/http-exception.filter.ts`, and `system-context.md`. The shared filtered-error contract is exactly `{ error: { code, message, request_id } }`; `request_id` must match the `X-Request-ID` response header. The filter maps known HTTP statuses to stable codes, keeps unexpected 5xx messages generic, and does not expose stack traces or sensitive details.

## Raw Output 1 — Create a Team

**Matches:** It proposes `POST /teams`, authenticated access, `201` on creation, `400` for a blank name, and reuse of the existing filter. It also proposes a transaction for the team, OWNER membership, and audit row.

**Gaps:** It does not require an exact error-body assertion or verify `request_id` against `X-Request-ID`. It omits the required unauthenticated `401` case and does not name the stable codes `BAD_REQUEST` and `UNAUTHORIZED`; “check errors with the existing filter” does not prove the response contract. “Get the user from the current principal” is also less precise than using `principal.principalId` from `{ principalId, username }`.

**Possible divergence:** A test could pass on status alone while a controller returns a different JSON shape, omits the correlation ID, or exposes an unhandled error. The route could also fail to verify its unauthenticated behavior.

## Raw Output 2 — Accept and Expire Invitations

**Matches:** It hashes the presented token, checks recipient ownership, marks an already-expired invitation and returns `410`, and groups acceptance, membership, and audit writes in one transaction. It recognizes that a conditional update is needed to prevent replay.

**Gaps:** “Return conflict” does not explicitly require HTTP `409` with code `CONFLICT`, nor does the response define the exact error envelope. It omits the full behavior matrix: successful acceptance `201`, wrong recipient `403`, missing token/invitation `404`, expired invitation `410` / `GONE`, and replay or other non-pending state `409` / `CONFLICT`.

**Expiry race:** The instruction “If the update affects no rows, return conflict” conflates a replay with an invitation that expires after the initial read but before the conditional acceptance update. If expiry has passed, the implementation must mark a still-`PENDING` invitation `EXPIRED` and return `410`; it should return `409` when another acceptance already won or the invitation is otherwise no longer pending. Classify the failed conditional transition from the current persisted state and database-time expiry, rather than mapping every zero-row update to conflict.

**Possible divergence:** The same concurrent boundary can return `409` for an expired invitation, leave it pending, or return `410` for a replay. Tests that only exercise an invitation already expired before the first read would miss this race.

## Raw Output 3 — Ordered Activity Feed

**Matches:** It specifies a member read path, `403` for non-members, ascending cursor results, and a default cursor value.

**Gaps:** It omits the success status (`200`), invalid-cursor status (`400` / `BAD_REQUEST`), and an exact error-envelope assertion including `request_id`. It also does not describe unauthenticated behavior (`401` / `UNAUTHORIZED`) or the stable `FORBIDDEN` code for `403`.

**Related correctness risk:** `MAX(sequence) + 1` is not a safe concurrent sequence-allocation contract. The bundle already says allocation must be atomic per team and explicitly forbids unprotected `MAX(sequence)+1`. A uniqueness failure could become an unplanned `500`; even then, the filter requires the generic, exact 500 envelope.

## Why the first pass left room to diverge

`system-context.md` contains the exact envelope, full status-to-code table, principal shape, and distinct `409` versus `410` meanings. The context bundles mention the common filter and several route statuses, but their output formats do not consistently require the three-field JSON body, header correlation, stable code, and status/body assertion as one testable contract. For invitation acceptance, the bundle lists expired `410` and replay `409`, yet the raw output reduces the conditional-update failure path to “conflict”; it does not spell out the concurrent expiry recheck and state classification. The gap is therefore that important context was available but not carried into mandatory, branch-specific assertions in the first-pass outputs.

## Assertions to carry into revisions

- For every error case, assert HTTP status, stable `error.code`, exactly the `error.message` and `error.request_id` fields inside `error`, no extra error fields, and equality between body `request_id` and `X-Request-ID`.
- Cover each route's complete expected status matrix, including authentication, authorization, not-found, invalid-input, success, lifecycle conflict, and expiry cases where applicable.
- For invitation acceptance, separately test an already-expired invite and expiry between read and conditional update (`410` / `GONE`), plus replay or competing successful acceptance (`409` / `CONFLICT`).
- For unexpected failures, verify the generic 500 client message and absence of internal details; keep detailed diagnostics server-side.
- For activity writes, use the atomic sequence strategy from the task context and test concurrent allocation as well as the response contract.
