# Module 06 — STEP 5: BREAK Resilience Analysis

## Scope and evidence boundary

This is a symptom-driven BREAK review of the three scenarios from the official prompt and this checkout’s resilience code. No application source, `package.json`, or `prisma/` files were modified in this BREAK pass. Static inspection and mocked tests ran; no live dependency was stopped or restarted. The injected changes are not assumed to be present merely because a scenario describes them.

## Scenario analysis

| Scenario | Symptoms and blast radius | Symptom-consistent failure mechanics to investigate | Current checkout evidence / posture | Detection and verification boundary |
|---|---|---|---|---|
| A — runaway retry | One slow request is followed by rising CPU, many retry records, increasing memory, and an unresponsive process. A retry loop can multiply dependency load and hold request state/timers until unrelated routes stall. | Hypothesis requested before diagnosis: identify the retry budget and timer lifecycle that could turn one dependency failure into repeated work; compare the configured attempt count to the symptom’s “hundreds per request.” | BREAK-time evidence: `retryTransient` had a finite `maxRetries` at its analytics call site (`1`) and BullMQ enqueue had 3 total attempts, but the helper did not validate or hard-cap a caller-supplied `maxRetries`. The Module 06 FIX now validates and clamps it to a hard maximum of 5. `Promise.race` timeouts still do not cancel underlying analytics promises. | Mock tests cover one retry, permanent-error no-retry, and a delay cap; FIX adds runaway-budget tests. They do not create CPU/memory load. **NOT EXECUTED:** live slow-dependency/load reproduction. |
| B — circuit never heals | Fallback initially masks a dependency outage; after recovery, callers remain on fallback and normal service does not return. This can leave a degraded mode in place indefinitely. | Hypothesis requested before diagnosis: inspect recovery timer, half-open admission, and state transitions; confirm a successful probe can close and a failed probe can reopen. | The production breaker is Redis redirect-cache-read only, with threshold 3 and open interval 5000 ms. `CircuitBreaker` transitions open to half-open after the interval, allows one probe, closes on probe success, and reopens on probe failure. It does not protect PostgreSQL. A DB-down/restart scenario therefore has no DB circuit in this app; it must not be described as a broken DB breaker. | Generic mocked test proves close-after-success using test threshold/reset 2/100 ms; cache mock proves open after 3 Redis read failures. It does not exercise the configured 5000 ms recovery period or a live dependency restart. **NOT EXECUTED:** live DB/Redis recovery and circuit-close HTTP proof. |
| C — synchronized stampede | On recovery, callers retry at the same times, immediately loading the recovering dependency again and extending the outage. Concurrent requests and replicas increase the burst. | Hypothesis requested before diagnosis: compare each retry layer’s delay distribution; locate deterministic schedules separately from jittered schedules. | BREAK-time evidence: analytics queue enqueue used one retry with full jitter; BullMQ used 3 total attempts with exponential backoff and `jitter: 0.5`. CacheService reconnects were deterministic (`times * 200`) and are now changed to capped full jitter while retaining the 3-retry stop rule. BullMQ connection config sets `maxRetriesPerRequest: null`, required for worker operation; it is not a finite request retry budget. | Unit tests confirm deterministic injected jitter values and the BullMQ jitter option. FIX also tests the reconnect delay function; neither simulates many processes reconnecting together. **NOT EXECUTED:** multi-instance recovery/load test. |

### Cross-cutting workspace failure gaps

- **Redis-only circuit:** the breaker protects cache reads, not PostgreSQL, queue calls, cache writes, cache invalidation, or critical mutations. A Redis cache miss/degradation falls back to PostgreSQL; if PostgreSQL also fails, an uncached redirect returns a sanitized error. Auth and critical writes remain fail-closed.
- **Uncanceled timeout races:** `withDependencyTimeout` and the readiness/analytics `Promise.race` bound how long the caller waits and clear their local timer, but they do not cancel the already-started driver/queue promise. PostgreSQL statement/query bounds constrain DB execution; BullMQ’s `maxRetriesPerRequest: null` means an enqueue may remain pending beyond the 500 ms caller race. Stable event ID/job ID makes queue retries duplicate-safe, but timeout is not cancellation.
- **Analytics fallback failure:** after queue failure, the service tries a DB write. If that fails, it emits a sanitized error and still returns `{ eventId }`. This preserves redirect availability, but it does not mean the click event was durably stored; telemetry can be lost without a caller-visible error.
- **Best-effort cache invalidation:** delete/update invalidation failures are caught and logged rather than failing the critical DB mutation. This favors availability but can leave stale redirect entries until TTL expiry. The redirect cache read breaker does not protect invalidation.
- **Retry budget validation:** application call sites are bounded, but the generic `retryTransient` accepts a caller-supplied `maxRetries` without a global maximum or finite-integer validation. Review every future call site so an unbounded option cannot reintroduce Scenario A.
- **Database pool and timeouts:** PostgreSQL adapter config includes connection timeout 2000 ms, pool max 10, statement timeout 3000 ms, and client query timeout 3500 ms. This limits waits but does not create a DB breaker or replace live pool-saturation testing.

## Verification results

The following runs were performed for this BREAK. Each Jest command emitted Node’s standard VM Modules experimental warning.

### Startup fail-fast checks

Ran from the system temp directory to avoid loading a repository `.env`. The production drill used a synthetic credential marker and did not print it.

```text
DRILL_MISSING_DATABASE_URL
{"timestamp":"2026-11-24T04:29:14.854Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_INVALID_NODE_ENV
{"timestamp":"2026-11-24T04:29:19.079Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_PRODUCTION_REDACTION_MISSING_REDIS_URL
{"timestamp":"2026-11-24T04:29:24.033Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
EXIT=1
SECRET_MARKER_PRESENT=False
STACK_PRESENT=False
```

The production drill failed fast at required configuration validation because `REDIS_URL` was omitted. It verifies that startup error is redacted and that the marker/stack are absent; it is not a live database connection-failure drill.

### Lint and build

```text
& 'C:\Program Files\nodejs\npm.cmd' run lint
> api@0.0.1 lint
> oxlint --type-aware src/ test/
Six pre-existing typescript(unbound-method) warnings in src/teams/team-collaboration-contracts.spec.ts at 116:17, 166:17, 217:17, 261:17, 277:71, and 309:17.
LINT_EXIT=0

node ./node_modules/@nestjs/cli/bin/nest.js build
Output: (no output)
BUILD_EXIT=0
```

### Jest suites

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
RESILIENCE_EXIT=0
```

Total: **13 suites and 75 tests passed**.

### Whitespace and runtime availability

```text
git diff --check
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
DIFF_CHECK_EXIT=0

docker info
Client: Version 29.9.2; Context desktop-linux
Server: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
DOCKER_EXIT=1

Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
TEST_NET_COMMAND_EXIT=1
```

**NOT EXECUTED:** live Docker stop/start/build/run/health/fault drills; live PostgreSQL outage/restart; live HTTP response-time/fallback measurement; multi-instance reconnect-stampede test; and live breaker recovery logs. Docker’s Linux engine pipe is absent and local PostgreSQL port 5432 is unreachable. The unit and mocked checks above are not substitutes for those runtime drills.

## BREAK hypothesis checkpoint

The official BREAK asks for a hypothesis before diagnosis. This artifact records observable code and verification facts first; the learner’s A/B/C hypothesis should be captured before any proposed repair or claim that an injected defect was reproduced. The actual checkout currently shows bounded retry usage, a half-open recovery path, and jittered analytics retries, alongside the documented residual risks above. No injected change was independently reproduced in this environment.
