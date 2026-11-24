# Module 05 — FIX: Recovery and Continuous-Delivery Verification

## Refinement Choice

**Option 1 — Surgical targeted refinement** fits when the structural boundary remains sound and the failure report is narrow and testable. Add a focused regression test around the missing behavior, preserve the existing service-owned post-commit dispatch and sequence contract, and change implementation code only if that test demonstrates a defect.

**Option 2 — Clean-context restart** fits when the architectural assumptions have become polluted or contradictory, multiple targeted refinements fail to converge, or a structural flaw changes event ownership, authorization, sequence guarantees, or subscriber lifecycle. Restart with a concise verified contract and a different architecture instead of layering another patch onto an incoherent path.

This implementation required Option 1 only. The reported “drops after the first event” behavior was not reproduced by the existing mocked tests, and the new focused test passed against the current service without a production-code change. The existing post-commit service boundary remained sound, so a rewrite of `team-activity-feed.service.ts` was not justified. This is mocked unit evidence; it does not establish live PostgreSQL/HTTP behavior.

## Four Functional Scenarios

| Scenario | Exact test case | Result | What the test establishes |
|---|---|---|---|
| **1. Connection and authorized team channel subscription** | `Scenario 1: authenticates and subscribes only after live team membership authorization` | **PASS** | Mocked JWT verification produces `{ principalId, username }`; mocked live role lookup is scoped by team and principal; member access opens a feed scoped to that team, while a member is rejected when the required role is `OWNER`/`ADMIN`. |
| **2. Event delivery, including consecutive events on one open stream** | `Scenario 2: delivers a typed team activity when service work commits`; `Scenario 2 follow-up: keeps one open subscriber receiving sequences 1, 2, and 3 after a heartbeat` | **PASS** | The first test checks typed event delivery after a mocked transaction resolves. The new test keeps one subscriber open, observes a heartbeat ping and acknowledges it, then creates three service-generated comments; it receives sequences `1`, `2`, and `3` in order without reconnecting. |
| **3. Disconnection and subscription/timer cleanup** | `Scenario 3: disconnect removes the subscription and heartbeat timer without crashing`; `sends heartbeat pings and removes connections that miss pong acknowledgements` | **PASS** | Unsubscribe removes the timer and connection safely; publishing after disconnect does not crash. The heartbeat test separately verifies ping emission, timeout completion, and cleanup after a missing pong. |
| **4. Reconnection and replay after the last sequence** | `Scenario 4: reconnects after disconnect and replays only persisted events after lastSequence` | **PASS** | Reconnects with `lastSequence=1` and replays only mocked persisted sequence `2` after receiving `1` before disconnect. |

## Exact Verification Results

### Focused Jest suite

Command:

```text
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts --runInBand
```

Output:

```text
(node:17900) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 1 passed, 1 total
Tests:       6 passed, 6 total
Snapshots:   0 total
Time:        1.975 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts.
EXIT_CODE=0
```

### Nest build

Command:

```text
node ./node_modules/@nestjs/cli/bin/nest.js build
```

Output:

```text
EXIT_CODE=0
```

### Diff check

Command:

```text
git diff --check
```

Output:

```text
warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
EXIT_CODE=0
```

The CRLF notice is Git's line-ending warning; there were no whitespace errors.

### Runtime verification boundary

Command:

```text
Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
```

Output:

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

The six passing tests use mocked Prisma/JWT behavior and in-memory feed subscribers. Live PostgreSQL-backed database and HTTP verification—including the multi-event stream—was **NOT EXECUTED** because PostgreSQL at `127.0.0.1:5432` is unreachable. No changes were made to `prisma/` or `package.json`; the feed service was not rewritten because the new regression test passed without exposing a source defect.
