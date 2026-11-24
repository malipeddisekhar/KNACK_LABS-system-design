# Module 05 — BREAK: “Works, Then Silently Drops After First Event”

## Diagnosis and Evidence Boundary

The symptom means a subscriber receives an initial activity event, then remains connected without receiving later team events. The supplied Round 1 → Round 2 → Round 3 framing suggests a possible interaction between a Round 2 dispatch refactor and Round 3 reconnect/heartbeat changes, but the existing `iteration-build-log.md` does not record a Round 2 dispatch refactor or a reproduced first-event regression. I therefore treat that chain as a failure hypothesis, not as an established root cause.

### Plausible interaction if the reported regression occurred

1. A dispatch refactor can accidentally make delivery one-shot—for example, by completing/removing a subscriber after the first callback, replacing a persistent team listener with a per-event subscription, or changing the dispatch key so later events no longer address the original team channel.
2. Reconnect and heartbeat work adds other lifecycle exits. If reconnect logic is mixed into the same polluted context, a completion/unsubscribe path may run after the first event, or a client that does not acknowledge `ping` can be closed at the 45-second timeout.
3. Reconnect replay may make the problem look temporarily repaired by replaying persisted events when the client reconnects. It does not restore continuous live dispatch while the client remains attached to an inactive subscription.

That is a plausible local lifecycle/dispatch interaction, but the existing history contains no intermediate Round 2 or Round 3 code snapshots or reproduction output to prove that exact chain.

## Current Code Check: Local Lifecycle vs. Structural Spiral

The current `src/teams/team-activity-feed.service.ts` source does not show an automatic “complete after first event” path. `publish` iterates the active team connection set (`:67-74`); `queue` advances and emits each contiguous sequence (`:106-119`); and `remove` clears the timer and maps only when the observable tears down or the heartbeat times out (`:130-150`). `heartbeat` completes the stream only after 45 seconds without a pong acknowledgement (`:41-42`, `:130-140`). A missing sequence can hold later events in `pending` until the gap is supplied, so a dropped/missing dispatch is another local failure hypothesis to test.

The current mocked tests do not reproduce the quoted regression. Scenario 2 exercises one post-commit event; Scenario 1 publishes one event directly; Scenario 4 covers replay after a disconnect. The heartbeat test covers timeout cleanup. There is no test that keeps one connection open through multiple consecutive post-commit activities, and no live HTTP trace showing that an event was delivered once and later delivery stopped. This is the remaining focused verification gap, not proof that the current source drops the second event.

The iteration record also does not show a context-pollution spiral. `iteration-build-log.md` keeps structural quality at 4/5 across Iterations 1–3, with surface quality improving from 3/5 to 4/5 after bounded compiler-driven refinement. `trajectory-and-functional-verification.md` records structural quality at 4/5 for Rounds 1–3 and surface quality rising from 3/5 to 5/5 as the four functional scenarios became explicit. Its Round 2 surface score (4/5) is a later verification assessment than the BUILD log's Iteration 2 score (3/5); both records agree the structural approach held and converged. Neither history records repeated unsuccessful refinements, a plateau, or a restart.

**Assessment:** If observed on a live subscriber, investigate dispatch registration, sequence gaps, and heartbeat acknowledgement as local lifecycle causes first. Do not call it a structural/context-pollution spiral based on the current records: the structural design stayed stable, changes converged, and the specific regression is not present in the saved test evidence. Context pollution remains a plausible explanation only if the unrecorded Round 2/3 edits combined one-shot dispatch with cleanup behavior.

## Verification Boundary

- The current focused suite has **5/5 mocked unit tests passing** (`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts --runInBand`). It verifies authorization-before-subscription behavior with mocked JWT/Prisma, one post-commit event, disconnect/timer cleanup, replay from a cursor, and heartbeat timeout. It does not test multiple consecutive service-generated events on one continuously open subscriber.
- `node ./node_modules/@nestjs/cli/bin/nest.js build` passed with exit code 0.
- PostgreSQL at `127.0.0.1:5432` remains unreachable (`Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` returned `False`). Live PostgreSQL-backed DB/HTTP delivery, sequence-gap, and heartbeat/pong behavior are **NOT EXECUTED**.

## Next Discriminating Check

Keep one authorized stream open, create at least two activities sequentially and a third while two are concurrent, then record each event's committed sequence, `publish` call, SSE delivery, and subscriber state without reconnecting. If publication is missing, trace the service dispatch path; if publication occurs but delivery does not, inspect the team connection registration and sequence buffer; if the stream completes, capture whether disconnect teardown or heartbeat timeout ran. Run the same scenario after a deliberate reconnect with the last delivered sequence to distinguish live dispatch from persisted replay. Treat this as a future live test; it was not executed because PostgreSQL is unavailable.
