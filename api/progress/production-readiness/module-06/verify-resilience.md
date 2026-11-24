# Module 06 — STEP 4: VERIFY Resilience

## Scope and evidence boundary

Inspected the Module 06 build note, resilience helper/spec, BullMQ connection config/spec, Redis cache service/spec, all analytics files, readiness controller, structured logger, and `main.ts`. No application code, `package.json`, or `prisma/` files were changed in this VERIFY pass. Unit tests and local startup validation ran; no live service was available to stop or restart.

An installed circuit-breaker package was not found in the previous BUILD inventory. The checked-in `CircuitBreaker` is the local implementation described in the BUILD note, not a third-party library. The production breaker wraps Redis redirect-cache reads only. **It does not count PostgreSQL failures or open a PostgreSQL circuit.** The official live database stop/restart scenarios below are therefore not claimed as verified.

## Functional Verification 1 — Dependency timeout inventory

| Dependency / call | Configured bound / behavior | Evidence and boundary |
|---|---|---|
| PostgreSQL Prisma pool (`$connect`) | `connectionTimeoutMillis: 2000`; `max: 10` | `src/database/prisma.service.ts`; no live connection drill. |
| PostgreSQL statements and client queries | `statement_timeout: 3000`; `query_timeout: 3500` | Applies pool-wide to Prisma calls, including links, teams, readiness, metrics, and analytics. No query-timeout log was induced against a live DB. |
| PostgreSQL readiness query | `Promise.race` at 2000 ms, timer cleared in `finally` | `src/ready.controller.ts`; the client race does not cancel the submitted query. PostgreSQL statement timeout bounds the server-side work. Mocked readiness tests verify sanitized not-ready behavior and timer cleanup. |
| Redis cache connection / commands | `connectTimeout: 1500`; `commandTimeout: 1000`; custom reconnect delays 200/400/600 ms, then stop | `src/cache/cache.service.ts`. Cache reads degrade to a DB lookup; set/invalidation errors remain best-effort. No live Redis test. |
| BullMQ Redis connection | `connectTimeout: 2000`; `maxRetriesPerRequest: null` | `src/common/bull-config.ts`, both configured and localhost branches. The null request-retry setting is required by BullMQ worker operation and leaves the library’s reconnect behavior active; it is not itself a finite per-command timeout. |
| Analytics queue enqueue | One transient-only retry (full jitter, exponential ceiling 40 then 80 ms, capped 100 ms); caller wait 500 ms | `AnalyticsService.recordClick`; stable event ID/job ID makes an ambiguous enqueue retry duplicate-safe. A JavaScript timeout does not cancel the pending queue operation. |
| Analytics DB fallback | Caller wait 750 ms; underlying DB statement/query limits are 3000/3500 ms | Best-effort telemetry, not proof of persistence. A timed-out write can settle later; its event ID is unique and worker P2002 handling is idempotent. |
| Analytics worker persistence | DB limits above; BullMQ has 3 total attempts, exponential backoff from 500 ms with 50% jitter | Only allowlisted transient DB/network failures are retryable; permanent/unclassified errors use `UnrecoverableError`. At most two delays are scheduled (500 ms and 1000 ms). |
| HTTP server request/header/keep-alive | 30000 / 66000 / 65000 ms | `src/main.ts`. These are inbound server limits, not dependency budgets. |
| External HTTP, email, notification, filesystem client | None found in runtime `src/` search | Application logs write to stdout/stderr. No additional runtime HTTP/notification integration was identified. |

The cache and queue use ioredis/BullMQ behavior in addition to the explicit settings above. In particular, BullMQ’s worker-compatible `maxRetriesPerRequest: null` means a producer-side Promise timeout bounds the HTTP caller’s wait but does not cancel the pending Redis request. Shutdown `quit`/`close` calls also have no separate application-level deadline. DNS resolution is not configured as an independent operation; it is included in the respective connection attempt and remains subject to driver/OS resolver behavior.

## Functional Verification 2 — Circuit threshold and recovery

- `CacheService` configures **3 consecutive Redis read failures** and a **5000 ms** open interval. While open, cache reads return a miss without another Redis call, allowing the redirect service to try PostgreSQL. The cache service unit test exercised three mocked Redis failures, observed the `closed -> open` structured state event, and confirmed the next read did not call Redis.
- `resilience.spec.ts` exercises the generic state machine through `closed -> open -> half-open -> closed` with a successful recovery probe. Its test threshold/reset are 2/100 ms, so it verifies state-machine semantics, not the configured 3/5000 production instance.
- `cache.service.spec.ts` verifies the production threshold opens after three mocked failures; there is no test that advances the cache instance’s actual 5000 ms interval and proves a live recovery probe closes it.
- **NOT EXECUTED:** stopping PostgreSQL, observing PostgreSQL failures accumulate to a circuit threshold, restarting PostgreSQL, and observing a production DB circuit close. The current production breaker is Redis-only, so those DB-specific claims cannot be inferred from the mocked tests.

## Functional Verification 3 — Fallback latency and behavior

The mocked cache test confirms the open Redis circuit returns `null` without making another Redis call. It does not measure HTTP response time, and it does not verify a sub-100 ms API request. For a Redis read failure, the redirect service’s next step is a PostgreSQL lookup, which is independent of Redis but still an external dependency. If PostgreSQL is also down, an uncached redirect fails with a sanitized server error; there is no DB breaker or dependency-independent source for that redirect. Warm Redis entries may still be served before a database lookup, but that is not a measured fallback result.

**NOT EXECUTED:** live HTTP request with an open circuit, measured `< 100 ms` response, or a database-down API response. Docker engine access is missing and PostgreSQL port 5432 is unreachable.

## Functional Verification 4 — Retry/backoff visibility

- The retry helper unit test injected `ETIMEDOUT`, verified attempt 1 and a jittered 20 ms delay, then succeeded. Its cap test verified the sequence `[40, 80, 100]` with a deterministic upper-bound random source.
- The analytics service test verified `logDependencyRetry` receives dependency `redis`, operation `analytics_enqueue`, attempt 1, error code `ETIMEDOUT`, and the available request ID. `AppLogger` tests verify JSON structured timeout/retry/breaker fields and reject unsafe request IDs without emitting their raw values.
- BullMQ worker backoff is configured for 3 attempts, exponential 500 ms base, jitter 0.5; the maximum scheduled delay under this finite policy is 1000 ms. Worker error classification retries only recognized transient network/Prisma availability codes. P2002 is idempotent success, P2003 follows existing removed-parent handling, and permanent/unclassified errors are unrecoverable. Validation/auth paths do not use this retry helper.
- **NOT EXECUTED:** live Redis/DB fault injection and production log observation. The verified retry logs are mock/unit assertions, not captured live dependency logs.

## Functional Verification 5 — Circuit recovery

The generic breaker unit test verifies that after its configured test clock reaches the reset point, one successful half-open probe transitions to closed. The cache service unit test verifies opening at three failures. No live Redis restart/recovery was performed, and no production-instance 5000 ms recovery cycle was exercised. No `circuit_closed` live log line or successful live response is claimed.

## Conceptual Questions 1–3

1. **Open circuit and a purchase/critical write:** this API has no purchase endpoint. Applied to its critical writes (team/link mutations), failure must remain fail-closed: return a sanitized error, do not report success, and preserve auth/authorization checks. The Redis cache read breaker is non-critical: a redirect can try PostgreSQL after Redis fails. If PostgreSQL is unavailable too, the redirect cannot be served safely from an unknown cache miss; it fails rather than fabricating data. Analytics is best-effort telemetry, not a purchase/write success signal.
2. **Five seconds versus 500 ms:** at 100 requests/second, Little’s Law gives 100 × 5 = **500 in-flight requests** at a 5-second wait. With a pool of 20, approximately 480 wait for a connection. At 500 ms, 100 × 0.5 = **50 in-flight**, still 30 above the pool, but ten times fewer requests are held and the queue drains sooner. Short deadlines reduce resource occupancy; they do not eliminate overload by themselves.
3. **Red flags:** no backoff/jitter synchronizes retries and can amplify an outage; a breaker that never probes recovery permanently disables a path; a fallback that calls the same failing dependency is not a fallback. This implementation uses a half-open recovery probe and bounded jittered retries, but its Redis-to-PostgreSQL fallback is only independent when PostgreSQL is healthy.

## Exact verification results

### Startup failure-first checks

```text
DRILL_MISSING_DATABASE_URL
{"timestamp":"2026-11-23T17:21:43.838Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_INVALID_NODE_ENV
{"timestamp":"2026-11-23T17:21:45.913Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_PRODUCTION_REDACTION_MISSING_REDIS_URL
{"timestamp":"2026-11-23T17:21:47.997Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
EXIT=1
SECRET_MARKER_PRESENT=False
STACK_PRESENT=False
```

The production drill stops during fail-fast configuration validation (missing required production `REDIS_URL`); it verifies redaction for that startup failure, not for a live database connection failure.

### Lint and build

```text
& 'C:\Program Files\nodejs\npm.cmd' run lint
> api@0.0.1 lint
> oxlint --type-aware src/ test/
Six typescript(unbound-method) warnings in src/teams/team-collaboration-contracts.spec.ts at 116:17, 166:17, 217:17, 261:17, 277:71, 309:17.
LINT_EXIT=0

node ./node_modules/@nestjs/cli/bin/nest.js build
Output: (no output)
BUILD_EXIT=0
```

### Jest commands

All commands emitted Node’s standard VM Modules experimental warning.

```text
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand
Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
APP_FILTER_EXIT=0

node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
TEAMS_EXIT=0

node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts --runInBand
Test Suites: 4 passed, 4 total
Tests:       13 passed, 13 total
METRICS_EXIT=0

node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/analytics/analytics.service.spec.ts src/ready.controller.spec.ts --runInBand
Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
ANALYTICS_READY_EXIT=0

node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/common/resilience.spec.ts src/common/bull-config.spec.ts src/cache/cache.service.spec.ts --runInBand
Test Suites: 3 passed, 3 total
Tests:       8 passed, 8 total
NEW_RESILIENCE_EXIT=0
```

Combined: **13 suites, 75 tests passed**.

### Whitespace and environment checks

```text
git diff --check
Exit: 0; no whitespace errors.
Warnings: LF/CRLF normalization for .github/workflows/ci.yml, api/.dockerignore, api/.gitignore, and api/Dockerfile.

docker info
Client: Version 29.9.2; Context desktop-linux
Server: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
DOCKER_EXIT=1

Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

**NOT EXECUTED:** live Docker stop/start/build/run/health/fault tests; live PostgreSQL stop/restart and recovery; live HTTP with an open DB circuit; measured `< 100 ms` fallback; and live external-dependency logs. These require a reachable Docker engine and database, neither of which was available in this run.
