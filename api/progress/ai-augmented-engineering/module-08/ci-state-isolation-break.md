# Module 08 BREAK — CI State Isolation

## What fails on a clean CI database

The DB-backed `src/teams/teams.collaboration.spec.ts` logs in during `beforeAll` as fixed development identities (`alice` and `bob`). It does not create those accounts; its one integration test then uses their bearer tokens and fixed principal IDs to exercise team creation, invitation, acceptance, roles, comments, and audit access. The test body creates its team and later deletes that team/audit rows, but the login happens first. On a populated local database the accounts may already exist and the test can proceed; on a newly created CI database without the matching user fixtures, login fails before the scenario begins. The spec was inspected only and was **not run** because PostgreSQL is unavailable.

Jest has another explicit clean-environment requirement: `test/setup-test-db.ts` requires an explicit `TEST_DATABASE_URL` whose database name is exactly `url_shortener_test`, then sets the test process's `DATABASE_URL` to that value. It never derives the test URL from the development URL and does not seed users. This guard protects the database boundary but does not provision test data. CI must supply the guarded test URL and create/migrate/seed only the disposable test database.

## Why implicit state appears, and how to prevent it

An AI generator can observe or be told about a developer database that already contains users, teams, or roles. It may then write a test that logs in as a remembered account or queries a known row without first creating it. That test looks green locally but asks a clean CI database for data that does not exist. The remedy is test-owned state: create every required principal/team/role in that test's setup (or an explicit deterministic test fixture step), use generated IDs, assert the resulting rows and responses, and remove the test-owned rows in `finally`/teardown. Independent tests must not depend on order, a shared development seed, or records left by another test.

## Isolation audit of the mocked suites

| Suite | Fixture/state review | Timer/mock cleanup | Finding |
|---|---|---|---|
| `src/teams/team-activity-feed.spec.ts` | Each test constructs its own feed, Prisma mock, event history, message array, and principal/team inputs. The module-level `teamId` and `principal` are constants and are not mutated; helper `row()` returns a new event object and `liveFeedDb()` creates a fresh default history array. The `it.each` membership cases each receive their own query mock. | Every created RxJS subscription is registered only for teardown, then unsubscribed and removed from the registry in `afterEach`; it does not carry fixture data between cases. Fake-timer cases also clear timers and restore real timers in `finally`. `afterEach` restores spies and clears mock call state. | No dependency on pre-existing database records or another test's state was found. |
| `src/teams/team-collaboration-contracts.spec.ts` | Each test creates its own `$transaction`, `$queryRaw`, `$executeRaw`, feed mock, response fixtures, and state arrays. The top-level team ID/principal are immutable scalar/test identity values; the end-to-end transaction queue and audit rows are created inside that one test. | No timer state is created by this suite. It now clears pending timers, restores spies, and clears mock call state in `afterEach`, so future timer/spy additions start clean. | No pre-existing DB state or shared mutable fixture dependency was found. |
| `src/teams/teams.collaboration.spec.ts` (read-only) | One sequential integration scenario creates its own team and removes it and its audit rows in `afterAll`, but assumes pre-existing `alice`/`bob` users and their credentials during `beforeAll`; no user setup or seed step is present in this spec. | The application is closed in `afterAll`; there is no per-test mock/timer fixture because it is a live HTTP/DB suite. | **Clean-CI risk:** the assumed accounts must be explicitly seeded/created in CI or the login fails before the test reaches its owned team setup. |

The mocked suites do not use a real DB connection, but the Jest setup still requires a correctly configured `TEST_DATABASE_URL`; this is configuration validation, not evidence that PostgreSQL was contacted. Their mocks exercise service/guard/feed behavior but cannot establish database constraints, locking, or actual HTTP middleware behavior.

## Exact verification outputs

Command:

```text
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
```

Output:

```text
(node:21492) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        17.164 s
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

Exit code: `0` (the warning concerns the existing line-ending state; no whitespace error was reported).

Command:

```text
Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
```

Output:

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Therefore the DB-backed `teams.collaboration.spec.ts`, live PostgreSQL checks, and live HTTP checks remain **NOT EXECUTED**. No migration was applied. The documentation identifies the missing CI account fixture; this BREAK review does not modify the integration spec or application code.
