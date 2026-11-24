# Module 06 — STEP 6: FIX and Verification

## Changes made

No changes were made to `package.json` or `prisma/`. No third-party circuit-breaker package is installed in this checkout, so the existing dependency-free breaker was retained rather than adding an unapproved dependency.

### A — hard-bounded retry budgets

`retryTransient` now validates `maxRetries` as a finite, non-negative integer. Invalid values (`-1`, a fraction, `NaN`, or `Infinity`) fail immediately with a `RangeError`, before the operation is called. Valid values above `MAX_TRANSIENT_RETRIES = 5` are clamped to five retries, for at most six operation attempts. The per-call attempt ceiling and maximum delay cap remain intact; permanent errors still do not retry.

Tests exercise invalid budgets, clamp `Number.MAX_SAFE_INTEGER` to five retries, verify six total calls maximum, verify the deterministic backoff ceiling `[40, 80, 100]`, and check permanent errors make only one call.

### C — jittered bounded Redis reconnects

`CacheService` now routes ioredis reconnect scheduling through `redisReconnectDelay`. It preserves a three-retry limit, uses an exponential delay ceiling of 200/400/800 ms for those attempts (never more than the 1000 ms configured maximum), and applies full jitter `[0, ceiling)`. Attempt four and invalid attempt numbers stop reconnecting (`null`). This prevents multiple instances with the same attempt number from all using the same delay. Unit tests inject deterministic random values and verify both spread and cap behavior.

### B — breaker and fail-closed behavior retained

Tests now cover both half-open outcomes: a successful probe transitions `closed -> open -> half-open -> closed`; a failing probe transitions `closed -> open -> half-open -> open`. The configured production breaker remains limited to Redis redirect-cache reads (3 failures, 5000 ms open period). It is not a PostgreSQL breaker. Authentication, authorization, and critical writes remain outside retry/fallback behavior and fail closed. Timeout/retry/breaker logs remain structured and allowlisted.

## Residual boundaries

- PostgreSQL is not circuit-broken. Connection/query timeouts and readiness behavior are not equivalent to a DB circuit or live recovery proof.
- JavaScript `Promise.race` timeouts limit the caller’s wait but do not cancel a pending driver/queue promise. Stable analytics event/job IDs mitigate duplicate effects, but a timed-out operation can still settle later.
- Redirect cache writes and invalidation remain best-effort. Failed invalidation can leave stale data until TTL expiry.
- Analytics enqueue falls back to a DB write; if both fail, the service logs the sanitized failure and still returns an event ID. That ID is not evidence of durable telemetry.
- Deterministic PRNG injection proves delay bounds in unit tests; it does not prove independent process randomness or production multi-instance recovery behavior.

## Expected vs. actual verification

### Retry and reconnect tests

Expected: invalid retry budgets terminate immediately; very large finite budgets remain strictly bounded; delays remain under their cap; reconnect delays vary with the injected random sample; invalid/over-limit Redis reconnect attempts stop; circuit recovery closes on probe success and reopens on probe failure.

Actual: all these assertions passed in the local mocked suites. Redis/DB faults, multi-instance reconnection, live request latency, and actual live recovery logs were not simulated.

### Startup fail-fast drills

Commands ran from the system temp directory so the workspace `.env` was not loaded. The production drill used a generated marker that is not included here.

```text
DRILL_MISSING_DATABASE_URL
{"timestamp":"2026-11-24T04:52:12.657Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_INVALID_NODE_ENV
{"timestamp":"2026-11-24T04:52:16.803Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_PRODUCTION_REDACTION_MISSING_REDIS_URL
{"timestamp":"2026-11-24T04:52:20.954Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
EXIT=1
SECRET_MARKER_PRESENT=False
STACK_PRESENT=False
```

The production drill failed at required configuration validation because `REDIS_URL` was omitted. It confirms redaction and no stack/marker output for that startup failure; it is not a live database-connection failure test.

### Lint and build

```text
& 'C:\Program Files\nodejs\npm.cmd' run lint
> api@0.0.1 lint
> oxlint --type-aware src/ test/
Six existing typescript(unbound-method) warnings in src/teams/team-collaboration-contracts.spec.ts at 116:17, 166:17, 217:17, 261:17, 277:71, and 309:17.
LINT_EXIT=0

node ./node_modules/@nestjs/cli/bin/nest.js build
Output: (no output)
BUILD_EXIT=0
```

### Jest runs

Each Jest invocation emitted Node’s standard experimental VM Modules warning.

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
Tests:       11 passed, 11 total
RESILIENCE_EXIT=0
```

Combined: **13 suites / 78 tests passed**.

### Whitespace and environment

```text
git diff --check
Exit: 0; no whitespace errors.
Warnings: Git line-ending normalization notices for .github/workflows/ci.yml, api/.dockerignore, api/.gitignore, and api/Dockerfile.
Source trailing-whitespace check: NONE

docker info
Client: Version 29.9.2; Context desktop-linux
Server: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
DOCKER_EXIT=1

Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
TEST_NET_COMMAND_EXIT=1
```

**NOT EXECUTED:** Docker stop/start/build/run/health/fault tests; PostgreSQL stop/restart; live DB circuit demonstration; open-circuit HTTP measurement `< 100 ms`; and live recovery/close logs. The Docker Desktop Linux engine pipe could not be found and PostgreSQL port 5432 is unreachable.

## UPSK advancement status

Read-only `upsk --api-url https://api.upsk.to status --json` returned:

```text
{"timestamp_unix_ms":1795495768978,"level":"error","message":"command.failed","context":{"command":"status"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

The independent browser health probe returned `Internal Error`: `URL https://api.upsk.to/health is not accessible via this tool.` Therefore **UPSK advancement was not attempted**; current checkpoint could not be independently confirmed during this turn.

After connectivity returns and status confirms Module 06 FIX, run this PowerShell command:

```powershell
Set-Location -LiteralPath "D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api"
& "C:\Users\malip\.local\bin\upsk.exe" --api-url https://api.upsk.to next --summary "Bound and validated retry budgets to five retries, added capped jitter to bounded Redis reconnects, and tested successful and failed half-open breaker recovery; lint, build, and 13 suites/78 tests passed. Live Docker and PostgreSQL recovery checks remain NOT EXECUTED due unavailable Docker engine pipe and unreachable port 5432." --evidence "progress/production-readiness/module-06/resilience-fix-and-verification.md" --json
```
