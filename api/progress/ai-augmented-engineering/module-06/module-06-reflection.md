# Module 06 — Multiple Agents, One Codebase: Reflection

## Questions 1–5

### 1. What did the three parallel workstreams contribute?

Three scoped, read-only contract reviews covered comments and @mentions, audit recording/querying, and the activity feed/stream lifecycle. That let each review focus on one domain's data shapes, authorization, event effects, and boundaries while keeping shared implementation files unchanged during analysis. The coordinator then integrated a focused test file and, during FIX, made the comment audit change in the shared service with one owner.

### 2. What happened at integration, and were there merge conflicts?

There were no textual merge conflicts because the reviews were read-only and implementation edits were scoped to a single owner and the focused spec. Verification and BREAK exposed cross-feature gaps that isolation could miss: comment creation emitted an activity event but no audit row; REST and SSE expose different event fields; the feed is process-local; and service-level checks do not prove HTTP DTO validation. FIX added the comment AuditLog write in the same transaction as its ActivityEvent and verified post-commit publication. The REST/SSE shape and multi-instance fan-out limitations remain documented boundaries rather than silently claimed as fixed.

### 3. What time did parallel work save, and what did integration cost?

Parallel reviews reduced serial context switching and surfaced the three domain contracts together, so issues could be compared before changing shared implementation. We did not record elapsed-time measurements, so I cannot claim a numeric time saving. Integration still required checking shared service behavior, event naming, metadata, and transaction ordering; for tightly coupled edits, that review and merge cost can outweigh parallel speed.

### 4. What should the interface contracts include next time?

I would specify the canonical cross-feature data flow: request and principal, live authorization, primary mutation, audit side effect, activity sequence/event, commit, and post-commit publication. I would also define which actions require audit rows, the safe audit metadata fields, and the exact REST versus SSE shapes, including cursor and target identifiers. I would keep those externally visible contracts explicit while leaving internal helper names and implementation details flexible.

### 5. Why did scoped reviews plus a single integration owner work, and when is sequential work faster?

Scoped reviews worked because comments, audit policy, and feed lifecycle could be understood independently before their seams were compared. A single owner then handled shared TeamsService transaction ordering and the combined test, avoiding concurrent edits to the service/controller/schema. Sequential work is faster when every change touches the same small shared file, a schema or migration decision is still unsettled, or one task cannot start until another defines its contract.

## Evaluation Prompt Self-Ratings

- **Prompt Quality — 5/5:** The task named the feature boundaries, data contracts, protected files, verification commands, and the live database limit.
- **Review Thoroughness — 5/5:** The work reviewed comments, audit records, feed lifecycle, shared files, migration order, and cross-feature payload differences.
- **Engineering Judgment — 5/5:** The comment audit metadata contains mention count only; mocked evidence is not represented as live database/HTTP proof.
- **Iteration Efficiency — 5/5:** A targeted transactional audit write and focused assertions closed the identified gap without a schema migration or unrelated source rewrite.

## Decision Callback — Option A: Interface-First

I would choose Interface-First again, with one refinement: specify the system-level connections as well as each component's input and output. Output-only contracts leave cross-feature data flow to chance—for example, a comment endpoint can return a valid comment while no audit row exists, or an event can be persisted with fields that the SSE client cannot use to identify its target. Freezing the shared role, audit, activity, and transaction contracts first makes independent work safer without prescribing internal helper implementations.

## Ship Recap: Risk and Mitigation

**Risk:** Passing mocked unit tests may be mistaken for proof that transactional writes, live HTTP routes, or multi-instance fan-out work against a real database.

**Mitigation:** Keep live PostgreSQL/HTTP runs marked **NOT EXECUTED** until the guarded url_shortener_test database is reachable. Before claiming cross-instance delivery, verify shared pub/sub across application instances and review the merged code's authorization, audit metadata, and event boundaries.

## Comprehension Questions 1–3

1. **What problem does interface-first coordination solve?** It makes dependencies and shared data contracts clear before parallel changes can disagree at integration time.
2. **Which decision had the biggest impact?** Writing the comment AuditLog and ActivityEvent in the same transaction, then publishing only after commit, closed the identified audit/feed mismatch without leaking comment text into metadata.
3. **What proves the fix works end to end, and what does not?** The focused mock test verifies the comment, safe audit fields, activity insert, and post-commit publish ordering; the combined suite passed 9/9 and the Nest build passed. These do not prove a live database transaction, HTTP behavior, or cross-instance delivery.

## Mini Practical Task Proof

The deliverable is the comment flow in src/teams/teams.service.ts and the focused case in src/teams/team-collaboration-contracts.spec.ts. The service writes the comment, a TEAM_COMMENT_CREATED AuditLog record with { mentionCount }, and the matching ActivityEvent inside one mocked transaction; the test verifies the audit fields and excludes the comment body from audit values. Its mocked publisher asserts that the transaction has committed before publish. Verification output was 2 suites and 9 tests passed, Nest build exit 0, and git diff --check exit 0.

The local TCP probe returned False for 127.0.0.1:5432. Live PostgreSQL and HTTP tests are **NOT EXECUTED**; multi-instance fan-out also remains unverified.

## Reproducible Verification Record

Combined command:
    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

Output:
    (node:20960) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use node --trace-warnings ... to show where the warning was created)

    Test Suites: 2 passed, 2 total
    Tests:       9 passed, 9 total
    Snapshots:   0 total
    Time:        4.161 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
    Exit code: 0

Nest build:
    node ./node_modules/@nestjs/cli/bin/nest.js build
    Output empty; exit code 0.

Diff check:
    git diff --check
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
    Exit code: 0.

Database check:
    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False
    Live PostgreSQL/HTTP runs: NOT EXECUTED.

UPSK submission status:
    The read-only status response at timestamp_unix_ms 1795364453324 was command.failed for status; CLI error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Independent health probe: curl: (6) Could not resolve host: api.upsk.to. This is reachability from this environment, not confirmation of a service-wide outage. CLI version was upsk 0.1.30; timestamp 1795364453324 is 2026-11-22 16:20:53.324 UTC. Local last_error.json was last written at 2026-11-22 15:42:22 UTC and contains an older Module 5 report-payload read failure without trace identifiers; it does not describe this status failure. No report submission or advancement was attempted.

