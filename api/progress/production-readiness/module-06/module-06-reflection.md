# Production Readiness — Module 06 Reflection

## Resilience decisions

Aggressive dependency timeouts cap how long a request or worker occupies resources. Bounded retries with exponential backoff and jitter are limited to transient failures, so a temporary fault can recover without every caller retrying at once. The circuit breaker limits repeated calls to the degraded Redis redirect-cache read path, then permits a half-open probe after its open interval. Authentication, authorization, and critical database mutations remain fail-closed: these controls never invent a successful result or bypass a required write.

The local breaker is dependency-free and Redis-focused; it is not a PostgreSQL breaker. The verification covers deterministic transitions and retry bounds with mocks. It does not establish cross-process breaker coordination or live recovery behavior.

## What the verification establishes

The fresh local pass established that startup validation rejects a missing `DATABASE_URL` and invalid `NODE_ENV`, and that a production startup error is redacted without a stack or synthetic secret marker. Lint exited 0 with six existing `typescript(unbound-method)` warnings. Nest build exited 0. The five requested Jest groups passed 13 suites / 78 tests, covering application/error-filter behavior, team collaboration, metrics/logging/request IDs, analytics/readiness, and resilience/reconnect behavior. `git diff --check` exited 0.

These are local build, static, startup-drill, and mocked/unit-test results. Docker Desktop's client is installed, but `docker info` could not reach the `dockerDesktopLinuxEngine` named pipe. `Test-NetConnection` to `127.0.0.1:5432` returned `False`. Docker stop/start/build/run/health/fault checks and live PostgreSQL (`url_shortener_test`), HTTP latency, circuit-breaker recovery, and database fault drills are therefore **NOT EXECUTED**. No live infrastructure behavior is claimed.

## Practitioner / Production Readiness recap

- **Containerization:** Multi-stage `node:20-slim` build, non-root runtime, secret-aware `.dockerignore`, and health-check alignment were documented; image build, size, and runtime health remain unverified without the daemon.
- **CI/CD:** The workflow is structured as sequential lint/build/test/diff gates before a SHA-tagged image and main-only registry publication. Hosted CI and registry operations were not run in this local reflection.
- **Environment management:** Startup validation is fail-fast for required configuration and valid environment modes; production startup diagnostics are redacted. The fresh drills confirmed the relevant failure paths.
- **Observability:** JSON request-correlated logs, bounded Prometheus labels, alert definitions, and readiness behavior have local tests. Live metrics scrape and infrastructure alert behavior remain unverified.
- **Failure analysis and resilience:** Failures are distinguished by dependency and impact. Retry, breaker, and fallback behavior is bounded and explicit, with unresolved boundaries recorded below.

## Knowledge check and mini-practical

1. **Why analyze failure modes?** To identify user impact, detection gaps, and safe behavior before failures occur, instead of treating dependencies as permanently available.
2. **Most impactful decision:** Keep auth and critical writes fail-closed while limiting retries and circuit breaking to a safe, non-critical Redis cache-read path. This preserves data integrity while preventing cache degradation from overwhelming callers.
3. **End-to-end proof:** Fresh lint and Nest build succeeded; five requested Jest groups passed 13/13 suites and 78/78 tests; startup failure drills produced the expected exit-1 validation/redaction results; and `git diff --check` exited 0. Docker engine and PostgreSQL probes were unavailable, so no live fault/recovery or HTTP proof is claimed.

**Mini-practical evidence:** The requested command set was run locally. Tests cover retry budget validation/clamping, transient-only retry behavior, capped jittered Redis reconnect delay, circuit `closed -> open -> half-open -> closed` recovery, and reopening after a failed half-open probe. `docker info` reported a missing Docker Desktop engine pipe and the PostgreSQL port probe returned `False`; live checks remain **NOT EXECUTED**.

## Risk and mitigation

**Risk:** A JavaScript race timeout does not cancel the underlying database or queue promise, so a timed-out operation may continue using a connection or settle later. This can still contribute to pool pressure even when the caller has stopped waiting. **Mitigation:** Add and verify driver-level statement/acquire timeouts and cancellation where supported, then exercise connection release and write semantics against the isolated `url_shortener_test` database before deployment.

Other recorded boundaries are that the breaker protects Redis cache reads rather than PostgreSQL, cache invalidation remains best-effort, and a failed analytics fallback can leave an event non-durable. These limitations should remain visible in operational readiness decisions.

## Reproducible verification record

### Startup failure-first drills

The drills ran from the system temporary directory to avoid loading the workspace `.env`; the Redis URL was omitted for the production validation failure. Synthetic credentials/connection values were used only in the child process and were not printed.

```text
DRILL_MISSING_DATABASE_URL
{"timestamp":"2026-11-24T05:01:43.985Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_INVALID_NODE_ENV
{"timestamp":"2026-11-24T05:01:47.397Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_PRODUCTION_REDACTION_MISSING_REDIS_URL
{"timestamp":"2026-11-24T05:01:50.565Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
EXIT=1
SECRET_MARKER_PRESENT=False
STACK_PRESENT=False
```

### Lint and build

```text
& 'C:\Program Files\nodejs\npm.cmd' run lint
> api@0.0.1 lint
> oxlint --type-aware src/ test/

src/teams/team-collaboration-contracts.spec.ts:116:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:166:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:217:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:261:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:277:71: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:309:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of `this`. help: If your function does not access `this`, you can annotate it with `this: void`, or consider using an arrow function instead.
LINT_EXIT=0

node ./node_modules/@nestjs/cli/bin/nest.js build
BUILD_EXIT=0
```

### Jest suites

All five invocations emitted Node's standard `ExperimentalWarning: VM Modules is an experimental feature and might change at any time` (with the usual `--trace-warnings` hint).

```text
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand
Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        8.081 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
APP_FILTER_EXIT=0

node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        5.346 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
TEAMS_EXIT=0

node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts --runInBand
Test Suites: 4 passed, 4 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        4.114 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts.
METRICS_LOGGER_EXIT=0

node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/analytics/analytics.service.spec.ts src/ready.controller.spec.ts --runInBand
[Nest] LOG [AnalyticsService] Enqueued click job (test-generated eventId/linkId values).
[Nest] WARN [AnalyticsService] Queue unavailable; applying durable database fallback (details withheld).
[Nest] LOG [AnalyticsService] Durable fallback saved click event (test-generated eventId).
[Nest] LOG [AnalyticsWorker] Persisted click event (test fixtures).
[Nest] WARN [AnalyticsWorker] Duplicate eventId ignored (idempotent; test fixture).
[Nest] ERROR [AnalyticsWorker] Failed to persist click event; details withheld. (expected negative-path test output)
[Nest] LOG [AnalyticsService] Purged 7 click events older than test retention cutoff.
Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        6.11 s
Ran all test suites matching src/analytics/analytics.service.spec.ts|src/ready.controller.spec.ts.
ANALYTICS_READY_EXIT=0
```

The analytics/readiness block above preserves the observed log content and test result while abbreviating generated test IDs and timestamp values; they are nondeterministic fixture output, not live traffic evidence.

```text
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/common/resilience.spec.ts src/common/bull-config.spec.ts src/cache/cache.service.spec.ts --runInBand
Test Suites: 3 passed, 3 total
Tests:       11 passed, 11 total
Snapshots:   0 total
Time:        1.62 s
Ran all test suites matching src/common/resilience.spec.ts|src/common/bull-config.spec.ts|src/cache/cache.service.spec.ts.
RESILIENCE_EXIT=0
```

### Diff and live environment probes

```text
git diff --check
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
DIFF_CHECK_EXIT=0

docker info
Client: Version 29.9.2; Context desktop-linux; Debug Mode false
Server: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
DOCKER_INFO_EXIT=1

Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Docker stop/start/build/run/health/fault checks and live PostgreSQL stop/restart, HTTP open-circuit latency, and recovery checks are **NOT EXECUTED**. The current UPSK API status request also failed with `Cannot reach UPSK server at api.upsk.to (connection; source: --api-url)` after the independent health probe returned HTTP 200; submission and checkpoint advancement are unconfirmed.
