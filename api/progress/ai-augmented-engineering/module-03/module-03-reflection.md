# Module 3 — Context Engineering Reflection

## Reflection

### Layered context strategy and decision callback — Option B

Option B's layered context strategy fit this Team Collaboration work: architectural context explained the NestJS/Prisma system and shared contracts, local context narrowed attention to the relevant team files, and constraint context stated security, database, scope, and verification boundaries. Sorting information as essential, optional, noise, or never-shareable helped keep each task packet focused without hiding important interfaces.

I would choose this strategy again. The convention review showed why general reminders such as “use the existing error filter” were insufficient: the first-pass outputs still omitted the exact `{ error: { code, message, request_id } }` assertion, the `X-Request-ID` correlation check, and route-specific status coverage. Concrete examples and mandatory assertions in `system-context.md` and `task-context-bundles.md` turn broad convention mentions into reviewable requirements.

### Package size and maintenance across Bundles 1–3

The three bundles needed different amounts of context. Bundle 1 could stay relatively small around team creation, principal identity, the transaction, and `201`/`400`/`401`. Bundle 2 needed more detail because token recipient binding, database-time expiry, conditional acceptance, replay, and the `410` versus `409` race are distinct branches. Bundle 3 needed the schema counter and uniqueness constraint alongside cursor behavior so sequence allocation could not be reduced to `MAX(sequence)+1`.

The maintenance lesson is to keep stable global facts in one system-context document and task-specific files, branches, and acceptance cases in each bundle. Repeating the full status table or architecture in every bundle invites drift; merely linking to a convention without copying the relevant assertion into the task's expected output leaves room for omission. When a shared source contract changes, update the system context and the affected bundles, then rerun the convention audit.

## Evaluation Reflections

The live REFLECT prompt could not be fetched because UPSK CLI status requests returned a connection error. The four sections below answer the four evaluation areas requested for this task; they are not presented as verbatim official prompt wording.

### 1. How did the layered context strategy perform?

It exposed what each task needed while keeping the packet bounded: architecture and shared response behavior belonged in global context, while invitation races and activity sequencing belonged in their task bundles. Its weakness was that references to shared files did not automatically make the outputs operationally precise. The STEP 5 audit caught this, and STEP 6 added concrete, route-specific assertions and examples.

### 2. What did package size and prioritization teach?

More context is useful only when it changes the decision or acceptance test. Task 1 needed identity and atomic creation details; Task 2 needed every lifecycle branch and the expiry boundary; Task 3 needed the schema-backed counter, cursor rules, and concurrency constraint. Optional and noisy material should stay out unless a task touches it, while secrets and raw credentials should never enter the packet.

### 3. What changed after the convention review?

The context package now requires exact error bodies with no extra keys, stable status-to-code mappings, equality between the body request ID and `X-Request-ID`, distinct expiry and replay outcomes, and atomic sequence allocation using the existing team counter. The proof is a context-package conformance review, not a regenerated model answer: the original raw outputs remain intact as historical first-pass evidence.

### 4. What would I maintain or improve next time?

I would add explicit response assertions to the expected-output section when first writing each bundle, especially for races and boundary conditions. I would also keep one small cross-bundle contract checklist and verify it against the canonical source files whenever those conventions change. Finally, I would separate “the prompt now specifies the invariant” from “a new answer or implementation has passed it.”

## Knowledge Checks

### 1. What problem does context engineering solve?

It gives an AI the relevant system facts, task-local files, and hard constraints needed to produce focused work without drowning it in unrelated material. Good context also marks uncertainty and converts important conventions into explicit acceptance criteria, reducing plausible but divergent output.

### 2. Which decision had the biggest impact, and why?

Choosing the layered context strategy (Option B) had the biggest impact because it separated reusable architecture and constraints from task-specific implementation details. Adding concrete examples and required assertions after the audit made that decision effective: the response contract and concurrency rules became checkable instead of implicit.

### 3. What evidence demonstrates the context package was improved end to end?

`system-context.md` now includes an exact error-body assertion and request-ID header comparison, plus separate `410` expiry and `409` replay rules. The three expected-output bundles now specify route-specific status matrices and the schema-backed atomic sequence rule; `context-fix-verification.md` traces those additions to the source contracts. The raw first-pass file's SHA-256 remained `17A1277A613C62EF10B1A5783A66F383B9D8BB5127522D5239B189EF536B8F4D`, confirming it was preserved during this verification pass.

## STEP 4 Mini Practical — Verification Proof

**Command:** `git diff --check`, followed by a whitespace scan of `system-context.md`, `task-context-bundles.md`, and `context-fix-verification.md`, and a SHA-256 check of `raw-first-pass-outputs.md`.

**Observed result:** `git diff --check` exited `0`; Git printed only the pre-existing CRLF conversion warning for `api/src/app.module.ts`. The whitespace scan reported `PASS` for all three context documents. The raw first-pass file hash matched the value recorded before this pass: `17A1277A613C62EF10B1A5783A66F383B9D8BB5127522D5239B189EF536B8F4D`.

**Risk:** A tightened context package can be mistaken for proof that a newly generated answer or runtime implementation now conforms. **Mitigation:** Preserve the original raw output, label this as a context-level verification, and require a fresh output review or focused tests before claiming response or implementation conformance.

## Submission Boundary

UPSK CLI status was unreachable while preparing this reflection, so the exact live prompt wording, active server nonce, report acceptance, and checkpoint advancement remain unconfirmed. No `src/teams/` or `prisma/` files were modified.
