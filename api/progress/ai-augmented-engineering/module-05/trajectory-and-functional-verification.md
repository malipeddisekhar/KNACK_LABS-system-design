# Module 05 — Trajectory and Functional Verification

## Trajectory Analysis

| Round | Type | Structural quality | Surface quality | Key issue / outcome | Decision |
|---|---|---:|---:|---|---|
| **Round 1** | initial | 4/5 | 3/5 | The existing suite covered related invariants, but feed connection authorization, commit-to-subscriber delivery, timer cleanup, and reconnect replay were not each named and asserted as separate functional scenarios. | refine |
| **Round 2** | refinement | 4/5 | 4/5 | Added explicit scenario tests with mocked JWT and Prisma dependencies. Coverage now distinguishes the live-role gate, activity publication after transaction commit, disconnect cleanup, and cursor-based replay after reconnect. | refine |
| **Round 3** | refinement | 4/5 | 5/5 | The focused tests passed 5/5, the direct Nest build passed, and `git diff --check` exited 0. Live PostgreSQL-backed HTTP behavior remains outside this mock verification. | ship |
| **Round 4** | not needed | — | — | Not needed — shipped at Round 3. | — |

### Critical Questions

1. **Which iteration produced the highest-quality result, and why?** Round 3 did: each of the four requested functional scenarios has an explicit test name and assertion, with an additional heartbeat timeout test. The test suite and Nest build both pass, and the verification boundary is stated separately from the mocked behavior.
2. **Why was a restart not needed?** Structural quality stayed at 4/5 across the iterations. The service-owned, typed, team-scoped event path and post-commit publication remained sound; the gap was test specificity and compiler feedback, which targeted refinements addressed without changing the architecture.
3. **How did Option B and the Two-Iteration Rule prevent a quality spiral?** Option B kept attention on the structural contract—authenticated principal, live team membership, persisted sequence, and post-commit event ownership—before polishing individual test assertions. The first bounded refinements made the four scenarios explicit; because they converged, there was no reason to continue speculative prompt edits or restart a sound design.

## Functional Verification Results

These tests exercise in-memory behavior with mocked JWT verification and Prisma calls. They do not send live HTTP requests and do not connect to PostgreSQL. The `RequireTeamRoles` behavior is exercised by invoking the guards with a mock execution context; Nest build validates that the decorated controller compiles, but this is not a live controller/HTTP authorization test.

| Scenario | Exact Jest test | Result and evidence | Verification boundary |
|---|---|---|---|
| **1. Connection & authorized team channel subscription** | `Scenario 1: authenticates and subscribes only after live team membership authorization` | **PASS.** Mocked `JwtAuthGuard` assigns the `{ principalId, username }` principal. `TeamRoleGuard` queries the mocked membership for both `team_id` and `user_id`, permits a current `MEMBER` for the member feed, rejects that role when only `OWNER`/`ADMIN` is required, and the authorized feed emits a `connected` event scoped to the requested team. | JWT verification and database membership are mocked; the controller's actual HTTP route was not invoked. |
| **2. Event delivery when a team activity occurs** | `Scenario 2: delivers a typed team activity when service work commits` | **PASS.** `TeamsService.create` commits mocked team/member/audit/activity writes; the test asserts `publish` runs only after the mocked transaction resolves and the connected subscriber receives `teamId`, `sequence`, `type`, `actorId`, `payload`, and `createdAt`. | Database transaction is a test double; no real commit or HTTP event stream was exercised. |
| **3. Disconnection & subscription/timer cleanup without crashing** | `Scenario 3: disconnect removes the subscription and heartbeat timer without crashing` | **PASS.** A subscription creates one heartbeat timer; unsubscribe returns without throwing and leaves zero timers. Publishing after disconnect is safe and the removed connection cannot acknowledge a pong. The additional test `sends heartbeat pings and removes connections that miss pong acknowledgements` verifies ping emission and timeout completion/cleanup. | Uses fake timers and an in-memory subscriber map; no network socket was opened. |
| **4. Reconnection resubscribing and replaying events missed while disconnected** | `Scenario 4: reconnects after disconnect and replays only persisted events after lastSequence` | **PASS.** The first connection receives sequence `1` and disconnects. On reconnect with `lastSequence=1`, mocked persisted history returns sequence `2`; the subscriber receives only `2`, and the replay query runs for both connections. | The missed event is supplied by mocked Prisma history; persistence and live PostgreSQL replay were not exercised. |

## Exact Verification Outputs

### Focused Jest suite

Command:

```text
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts --runInBand
```

Output:

```text
(node:12708) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 1 passed, 1 total
Tests:       5 passed, 5 total
Snapshots:   0 total
Time:        1.993 s
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

The warning is Git's line-ending notice; there were no diff whitespace errors.

### Database reachability and unexecuted live verification

Command:

```text
Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
```

Output:

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Therefore live PostgreSQL-backed HTTP connection, membership, event-delivery, cleanup, and reconnect runs were **NOT EXECUTED**. No result above should be read as a live database or HTTP pass. `prisma/` and `package.json` were not modified for this VERIFY step.
