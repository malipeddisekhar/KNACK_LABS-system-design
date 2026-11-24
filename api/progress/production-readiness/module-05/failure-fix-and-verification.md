# Production Readiness — Module 05 STEP 6: Failure Fix and Verification

## Missed failure mode added to the analysis

Added the following row to `progress/production-readiness/module-05/failure-mode-analysis.md`:

| Probability | User impact | Current handling before this fix | Desired handling |
|---|---|---|---|
| Low–Medium | After a readiness check responds, its redundant 2-second timer could remain scheduled and delay shutdown/test completion; if the SQL probe times out, its query can still continue to occupy a DB connection. | `/ready` raced PostgreSQL and Redis operations against timers without clearing timer handles on success/failure. `Promise.race` did not cancel the underlying SQL operation. | Clear timeout handles in `finally`; give callers a safe 503 response and a fixed diagnostic warning. Treat DB query cancellation as a separate limitation unless a safe driver cancellation mechanism is available. |

This mode was easy to overlook because the endpoint's response deadline appeared bounded even though timers and the losing SQL operation had separate lifetimes. The first part is fixed here. The database driver operation is still not canceled after timeout, so pool consumption remains a residual risk.

## Fix applied

In `src/ready.controller.ts`, both database and Redis checks now use one `withTimeout` helper. It stores the timeout handle and clears it in `finally` whether the operation succeeds, rejects, or times out. The timeout remains 2 seconds. A resolved Redis `false` is now explicitly logged as unavailable or timed out; thrown errors and timeouts use fixed sanitized messages. No exception text, connection URL, credentials, or stack is logged.

When a required dependency is down or times out, `GET /ready` continues to set HTTP 503 and returns `status: "not_ready"`, the per-dependency `checks`, and the safe message `One or more required dependencies are unavailable.` It does not pass through the exception filter or turn the dependency result into a blanket 500. `GET /health` behavior, authentication, critical mutation handling, queue behavior, and `fail_closed` stance are unchanged. `src/analytics/analytics.service.ts` was inspected but not changed: its swallowed analytics fallback write failure remains documented as a separate non-critical data-loss risk.

`src/ready.controller.spec.ts` now verifies:

- A quick successful DB and Redis probe leaves zero pending fake timers.
- A hung mocked database probe times out, returns 503 with the safe message, logs a fixed PostgreSQL warning, leaks no synthetic URL/secret, and leaves zero timers.
- PostgreSQL and Redis failure cases return 503 with the safe message and dependency-specific sanitized warning.

The timed-out SQL promise itself cannot be canceled by this helper. That limitation is not represented as solved or live-verified.

## Re-simulation: expected vs. actual

| Check | Expected | Actual |
|---|---|---|
| Mocked DB + Redis respond before 2 seconds | Ready response; both timeout handles cleared | `ready.controller.spec.ts`: passed; `jest.getTimerCount()` was 0. |
| Mocked DB probe never settles | After 2 seconds return HTTP 503, `not_ready`, fixed safe message/log; no secret/URL; timer removed | `ready.controller.spec.ts`: passed; 503 and sanitization assertions passed; no timer remained. The mocked underlying SQL promise remained unresolved, so cancellation/pool release is not proven. |
| PostgreSQL rejects with synthetic connection detail | Return 503, fixed safe response/log only | Unit test passed; response did not contain `secret` or `postgres://`; fixed warning asserted. |
| Redis ping reports false | Return 503 and identify Redis unavailability safely | Unit test passed; fixed warning asserted. |
| Live dependency fault/recovery | Reproduce actual DB/Redis/network behavior and verify recovery | **NOT EXECUTED**: Docker daemon pipe unavailable; PostgreSQL port 5432 is closed. |

## Failure-first startup drills

The compiled app was launched from a fresh temporary working directory using synthetic environment values. The values themselves were not printed.

Missing `DATABASE_URL`:

```text
{"timestamp":"2026-11-23T16:36:48.251Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Invalid `NODE_ENV=prod`:

```text
{"timestamp":"2026-11-23T16:36:51.477Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Production startup failure redaction:

```text
{"timestamp":"2026-11-23T16:36:54.580Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

All three failed fast with exit 1. Production output contained no stack or synthetic secret/URL. These are configuration drills, not live DB failure tests.

## Verification outputs

Commands ran from `D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api`. The four requested Jest command groups all passed: 11 suites, 65 tests total.

`& 'C:\Program Files\nodejs\npm.cmd' run lint` — exit 0:

```text
> api@0.0.1 lint
> oxlint --type-aware src/ test/

src/teams/team-collaboration-contracts.spec.ts:116:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:166:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:217:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:261:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:277:71: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:309:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
```

`node ./node_modules/@nestjs/cli/bin/nest.js build` — exit 0; no output.

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand` — exit 0:

```text
(node:14268) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        5.719 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand` — exit 0:

```text
(node:2480) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        5.747 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts src/metrics/metrics.controller.spec.ts --runInBand` — exit 0:

```text
(node:13384) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 5 passed, 5 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        5.362 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts|src/metrics/metrics.controller.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/analytics/analytics.service.spec.ts src/ready.controller.spec.ts --runInBand` — exit 0:

```text
[Nest] 2464  - 23/11/2026, 10:06:12 pm     LOG [AnalyticsService] [Analytics] Enqueued click job: eventId=b8a941c4-5e26-4a04-a248-81a411756ee5 linkId=test-link-uuid
[Nest] 2464  - 23/11/2026, 10:06:12 pm    WARN [AnalyticsService] [Analytics] Queue unavailable; applying durable database fallback (details withheld).
[Nest] 2464  - 23/11/2026, 10:06:12 pm     LOG [AnalyticsService] [Analytics] Durable fallback saved click event: eventId=13e6df26-d8a3-497f-9c07-fc1178696f71
[Nest] 2464  - 23/11/2026, 10:06:12 pm     LOG [AnalyticsWorker] [AnalyticsWorker] Persisted click event: eventId=evt-uuid-1 linkId=link-uuid-1
[Nest] 2464  - 23/11/2026, 10:06:12 pm    WARN [AnalyticsWorker] [AnalyticsWorker] Duplicate eventId ignored (idempotent): eventId=duplicate-evt-id
[Nest] 2464  - 23/11/2026, 10:06:12 pm   ERROR [AnalyticsWorker] [AnalyticsWorker] Failed to persist click event (eventId=retry-evt-id); details withheld.
[Nest] 2464  - 23/11/2026, 10:06:12 pm     LOG [AnalyticsService] [Analytics] Purged 7 click events older than 2026-10-24T16:36:12.392Z (retention: 30 days)
(node:2464) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 2 passed, 2 total
Tests:       14 passed, 14 total
Snapshots:   0 total
Time:        5.289 s
Ran all test suites matching src/analytics/analytics.service.spec.ts|src/ready.controller.spec.ts.
```

No open-handle warning appeared in this run of the analytics/readiness group.

`git diff --check` — exit 0; only line-ending warnings:

```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
```

`docker info` — exit 1; client 29.9.2, context `desktop-linux`. Exact daemon error:

```text
Server:
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

**NOT EXECUTED:** Docker build/stop/run/health/fault checks.

`Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` — exit 0:

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

**NOT EXECUTED:** live PostgreSQL, HTTP, fault, or recovery checks and DB-backed integration tests. No non-test database was contacted.

## Remaining gates

- `Promise.race` does not cancel a database request that exceeds the readiness deadline; actual pool release after timeout is unverified and remains a risk.
- Redis and PostgreSQL recovery and network/DNS failure behavior need live verification from the service network when Docker and `url_shortener_test` are available.
- The analytics database fallback still logs and swallows a write failure; improve its durability/observability separately without breaking redirect availability requirements.

No `package.json` or `prisma/` changes were made.
