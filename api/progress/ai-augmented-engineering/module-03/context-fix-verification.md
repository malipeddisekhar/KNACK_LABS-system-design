# Module 3 — STEP 6 FIX: Context Repair and Verification

## 1. Violations and Gaps Identified

The first-pass raw outputs exposed four concrete risks:

1. **Error response assertions were missing.** Raw Outputs 1–3 mention statuses or the existing filter, but none requires asserting the exact `{ error: { code, message, request_id } }` envelope or matching `request_id` to `X-Request-ID`.
2. **Route status matrices were incomplete.** Raw Output 1 names `201` and `400` but not unauthenticated `401`; Raw Output 2 names expiry `410` and says only “conflict,” while omitting explicit `201`, `403`, `404`, and `409`; Raw Output 3 names only non-member `403`, omitting member `200`, unauthenticated `401`, and invalid-cursor `400`.
3. **Raw Output 2 conflates expiry with replay.** It says every conditional update affecting zero rows should return conflict. An invitation that crosses `expiresAt` after the first read should be marked `EXPIRED` and return `410`, while a competing acceptance or already non-pending invitation should return `409`.
4. **Raw Output 3 proposes unsafe sequence allocation.** `MAX(sequence) + 1` can race across concurrent writers; the prompt did not require using the schema's team counter and unique constraint as one atomic transaction.

## 2. Context Source of Each Gap

| Gap | Source evidence | Context weakness that allowed divergence |
|---|---|---|
| Envelope and correlation | `src/common/error-envelope.ts` defines exactly `code`, `message`, and `request_id`; `src/common/http-exception.filter.ts` emits that object and requires the body ID to match `X-Request-ID`. | The original context named the shared filter but did not require every task output/test to assert exact keys, stable code, and header correlation together. |
| Status/code mapping | `http-exception.filter.ts` maps `400/401/403/404/409/410` to `BAD_REQUEST/UNAUTHORIZED/FORBIDDEN/NOT_FOUND/CONFLICT/GONE`; `system-context.md` contains the complete mapping. | Original task output formats did not consistently enumerate every route branch and corresponding status/code assertion. |
| Expiry race | `prisma/schema.prisma` defines `TeamInvitationStatus`, `expiresAt` as `TIMESTAMPTZ(6)`, and the `PENDING` lifecycle; the common contract distinguishes expired `410` from lifecycle conflict `409`. | The initial wording described expiry before the update and replay after it, but did not specify how to classify a zero-row conditional update when time passes between those checks. |
| Activity sequence race | `prisma/schema.prisma` has `Team.activitySequence` (`BigInt`) and `ActivityEvent.sequence` (`BigInt`) with unique `(teamId, sequence)`. | The original Raw Output 3 did not carry forward the schema counter/unique-key context or require atomic per-team increment plus event insertion; it instead suggested `MAX(sequence)+1`. |

## 3. Tightened Context Added

Updated `system-context.md` with mandatory response assertion rules, a copyable Jest/Supertest example, relevant stable status codes, safe generic-500 assertions, explicit invitation race classification, and the schema-backed sequence-allocation rule. The response example now requires all of the following:

```ts
expect(response.status).toBe(403);
expect(response.body).toEqual({
  error: {
    code: 'FORBIDDEN',
    message: expect.any(String),
    request_id: expect.any(String),
  },
});
expect(response.headers['x-request-id']).toBe(response.body.error.request_id);
```

Updated `task-context-bundles.md` so each expected-output contract is executable and route-specific:

- **Bundle 1:** Assert `201`, `400 BAD_REQUEST`, and `401 UNAUTHORIZED`; every error checks the exact three-field envelope and request-ID header match.
- **Bundle 2:** Require `201`, `403 FORBIDDEN`, `404 NOT_FOUND`, `410 GONE` for expired state, and `409 CONFLICT` for replay/non-pending state. If a conditional update loses, classify using current persisted state and database time; mark a still-pending expired invite `EXPIRED` and return `410`.
- **Bundle 3:** Require cursor validation and `200`/`400`/`401`/`403` behavior with exact error-envelope checks. Allocate from `Team.activitySequence` atomically with `ActivityEvent` insertion in one transaction; explicitly prohibit unprotected `MAX(sequence)+1`.

`raw-first-pass-outputs.md` remains unchanged so it continues to represent the original first pass rather than edited evidence.

## 4. Re-Run / Verification Pass

Re-audited the revised context package against all four identified gaps. **Context-package verification passes:** the exact error envelope and `X-Request-ID` assertion are mandatory; each bundle lists its applicable status/code matrix; the expiry boundary has a distinct `410` path from replay/non-pending `409`; and the activity task requires the schema-backed atomic counter and forbids `MAX(sequence)+1`.

This pass verifies that the revised context now closes the instruction gaps. The original raw outputs are intentionally preserved and still demonstrate the old omissions; no claim is made that those unedited answers were regenerated or corrected. No application code or Prisma schema/migration was changed, and no test suite or migration was run for this documentation-only fix.

`git diff --check` was run after the edits. No new whitespace errors were found; Git emitted only the pre-existing line-ending warning for `api/src/app.module.ts`. The task edits were limited to Module 3 progress context documents; `src/teams/` and `prisma/` were not edited.
