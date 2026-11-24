# Module 08 FIX — Test Isolation and Verification

## Audit findings

### DB-backed integration spec: external seed dependency remains

`src/teams/teams.collaboration.spec.ts` was inspected read-only, as requested. The exact environment assumption is in test `enforces live roles, invite lifecycle, activity cursors, comments, mentions, and audit access`:

| Location | Observed behavior | Clean-CI effect |
|---|---|---|
| `teams.collaboration.spec.ts`, line 17 | `beforeAll` boots the app and begins authentication setup | Depends on the app/test database being ready before the test body starts |
| Line 20 | Local `login(username,password)` helper authenticates through `/auth/login` | The test has no user creation/factory call before login |
| Lines 21 and 22 | Owner and member are fixed `alice` and `bob` seed identities; credential literals are intentionally not reproduced here | A clean database without these accounts fails in `beforeAll`, before the test creates its team |
| Line 35 | The team ID is taken from the `POST /teams` response | This ID is correctly threaded from the creation result rather than assumed from a local database |
| Line 36 | Owner membership query uses fixed `principal-alice` | Assumes the seeded owner's principal identifier matches that literal |
| Lines 42–43, 48, and 51 | Invitation requests use fixed Bob email/principal values | Those identifiers must correspond to the seeded member; they are not derived from an account fixture created by this test |
| Lines 54, 55, 59, and 64–65 | Role changes, audit filtering, mentions, and expected mention IDs use fixed Alice/Bob principal identifiers | These assertions remain tied to the same external seed identities |
| Lines 25–30 | `afterAll` deletes audit rows and the created team when `teamId` exists, then closes the app | Team cleanup is conditional, but close is not in a `finally`; if a delete throws, `app.close()` may be skipped. Seed users are not created or cleaned up by this test. |

The spec has one sequential integration test and creates its team during that test. It does not create the users it authenticates as. This is the precise remaining clean-CI dependency. The spec was not changed because the instruction required it to remain read-only, and it was not executed because PostgreSQL was unreachable.

`test/setup-test-db.ts` requires an explicit `TEST_DATABASE_URL` whose database name is exactly `url_shortener_test`, then directs test `DATABASE_URL` to that target. This is a safety boundary, not a data seeding step; it contains no Alice/Bob fixture creation. CI must provision/migrate the disposable test DB and provide test-owned user setup before the integration scenario can pass on an empty database.

### Mocked suites: isolated fixtures and cleanup

| Suite | Per-test setup | Cleanup and external-state review |
|---|---|---|
| `src/teams/team-activity-feed.spec.ts` | `beforeEach` (lines 32–34) generates a fresh team UUID and principal ID for every case. Each test creates its own feed, Prisma mock, history arrays, message arrays, and transaction results. The static-looking IDs inside mocked rows are local fixture data, not lookups against any external database. | The subscription registry at lines 20–22 tracks resources only; `afterEach` (lines 37–43) unsubscribes and empties it, clears timers, restores real timers/spies, and clears mock calls. Fake-timer cases also clear timers in `finally` (for example, lines 141–143 and 173–187). No stateful DB fixture needs deletion because every service dependency is mocked. |
| `src/teams/team-collaboration-contracts.spec.ts` | `beforeEach` (lines 18–21) generates a fresh team UUID and actor principal. Each test constructs its own Prisma/feed mocks, transaction callback, result queues, and in-memory audit/event rows. The end-to-end mocked test uses the created team's returned ID for later invitation, acceptance, comment, and audit calls. | `afterEach` (lines 23–27) clears timers, restores real timers and spies, and clears mock call state. No real database rows are created. |

The generated per-test team/principal identifiers avoid shared hardcoded database identity assumptions. Named IDs such as `invitation-1` or `comment-1` that appear inside mocks are deterministic fake rows owned by that test; they are not external seed records. The feed suite's shared subscription registry is emptied at each teardown and does not carry fixture data between tests.

## Why generated tests pick up local data assumptions

An AI agent sees only the environment and context provided during generation. If a developer database already contains users and teams, an agent may treat those records as part of the test setup and write a login/query that succeeds locally. A clean CI database starts without that history, so the same test fails before it reaches its assertions. The human review contract is to verify that every referenced entity has a creation step owned by that test, rather than trusting a locally green run.

## Self-contained test contract

1. Each integration test creates the users, teams, roles, invitations, and other records it needs through supported test factories or actual API creation flows.
2. Store identifiers from creation responses/return values and thread those values into later requests and queries; never assume a seed user's ID or a team ID from another run.
3. Keep test URLs pinned to the disposable `url_shortener_test` database through the existing guard. Do not use `DATABASE_URL` as a fallback for `TEST_DATABASE_URL`.
4. Track which setup stages succeeded. Teardown deletes only resources created by that test, tolerates partially completed setup, and closes the application in `finally` so a cleanup failure cannot leak a server process.
5. Keep test-owned state independent across cases, and reset timers, subscriptions, spies, and mocks after each mocked test.

For the read-only integration spec, the fix still needed is to replace its Alice/Bob seed login dependency with test-owned user fixtures and generated principal IDs, then use those returned IDs throughout the membership, role, audit, invitation, and mention assertions. Once the spec may be edited and PostgreSQL is available, run it against a fresh guarded database to verify the setup/cleanup path.

## Verification outputs

Command:

```text
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
```

Output:

```text
(node:25860) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        4.759 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

Command:

```text
node ./node_modules/@nestjs/cli/bin/nest.js build
```

Output: no stdout/stderr; exit code `0`.

Command:

```text
git diff --check
```

Output:

```text
warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
```

Exit code: `0`; no whitespace error was reported.

Command:

```text
Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
```

Output:

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Live PostgreSQL/HTTP checks, migrations, and `teams.collaboration.spec.ts` database-backed execution remain **NOT EXECUTED**. The mocked suite passes in isolation; the pre-seeded-user integration issue is documented but not changed in this FIX because that spec was explicitly read-only.
