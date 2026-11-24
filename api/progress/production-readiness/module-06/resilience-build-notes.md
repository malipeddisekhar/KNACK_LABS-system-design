# Module 06 — Resilience Build Notes

## Scope and constraints

Inspected the readiness controller, Prisma adapter, Redis cache, BullMQ configuration, analytics producer/worker, application/bootstrap configuration, exception filter, logger, and metrics modules. No installed circuit-breaker package was present (`opossum`, `cockatiel`, and `@nestjs/terminus` were absent); therefore no dependency was added and `package.json` and `prisma/` were left untouched. A small isolated breaker was implemented in `src/common/resilience.ts`; this is a dependency-free implementation of the selected library-style closed/open/half-open contract, not a claim that a third-party breaker library is installed.

## Chunk 1 — Aggressive timeouts and structured logging

| Dependency / operation | Bound | Behavior |
|---|---:|---|
| PostgreSQL connection | 2,000 ms | Prisma PostgreSQL adapter connection timeout; pool max 10. |
| PostgreSQL statement / client query | 3,000 / 3,500 ms | Server-side statement timeout bounds execution; client query timeout bounds waiting. Database mutations still propagate failures and remain fail-closed. |
| Redis cache connect / command | 1,500 / 1,000 ms | Cache calls fail to the existing DB fallback; Redis retry strategy remains bounded to three reconnect delays. |
| BullMQ Redis connect | 2,000 ms | Applies to configured and local fallback connection options. |
| Readiness dependency checks | 2,000 ms | `GET /ready` returns the existing sanitized 503 shape; timeout timer is cleared on settlement. The driver query itself is not cancelled by the JavaScript race, but PostgreSQL's statement timeout bounds it. |
| Analytics enqueue / DB fallback wait | 500 / 750 ms | Best-effort click analytics cannot hold redirects indefinitely. Both paths emit structured timeout warnings. A timed-out operation may still settle later; stable `eventId` uniqueness and worker P2002 idempotency protect the queue/fallback overlap. |

`AppLogger` now emits allowlisted JSON fields for dependency timeout, dependency failure, breaker state, and retry events: dependency, operation, timeout/delay/attempt/error-code metadata, and a validated `request_id` where one is available. It never serializes exception messages, URLs, credentials, or stacks. Redirect request IDs flow from the existing request-ID middleware through `RedirectController` and `LinksService` into cache and analytics warnings.

The budgets are deliberately short starting limits, not P95-derived service-level objectives: no production latency distribution was available in this local check. Tune them against measured dependency P95/P99 and the redirect/user-wait budget before rollout.

## Chunk 2 — Circuit breaker and graceful degradation

The Redis redirect-cache **read** path has a 3-consecutive-failure threshold and a 5,000 ms open interval. It moves `closed -> open -> half-open`; only one recovery probe runs in half-open, success closes the breaker, and a failed probe reopens it. State transitions are structured and secret-free. While open, reads return a cache miss and the redirect path falls back to PostgreSQL.

The breaker does not wrap cache writes/invalidation, authentication, authorization, or database mutations. This avoids inventing success for security-sensitive or critical state changes. Existing cache set/invalidation remains best-effort and is a residual stale-cache risk if invalidation fails. `AnalyticsService` remains best-effort for click telemetry: it tries the queue, then a durable DB fallback; if both fail it logs a sanitized error and returns the event ID, matching existing behavior. It is not used as proof that analytics persisted.

## Chunk 3 — Bounded retries, exponential backoff, and jitter

- Queue enqueue retries at most once, only for allowlisted transient network codes (`ECONNRESET`, `ETIMEDOUT`, `EAI_AGAIN`, `ECONNREFUSED`, `EHOSTUNREACH`). Full jitter is applied to an exponential delay beginning at 40 ms, capped at 100 ms. The stable `eventId` is also the BullMQ `jobId`, making an ambiguous enqueue retry duplicate-safe.
- Analytics worker retries only transient network/Prisma availability codes. Permanent/unclassified persistence errors become BullMQ `UnrecoverableError`; P2002 remains idempotent success and P2003 remains the existing removed-parent handling.
- BullMQ uses 3 total attempts, exponential backoff starting at 500 ms with 50% jitter. The bounded attempt count limits its scheduled delays to 500 ms and 1,000 ms; there is no unbounded retry loop. No retries were added to auth, validation, or critical database mutations.
- A first cap test exposed a one-millisecond overshoot for an injected `random() === 1` (`[41, 81, 101]`); the random value is now clamped below 1 and the final cap test confirms `[40, 80, 100]`.

## Verification output

### Failure-first startup drills

Run from the system temporary directory so the workspace `.env` is not loaded. The missing-variable and invalid-mode checks were isolated, and the production check used a generated synthetic credential marker that was not printed.

```text
DRILL_MISSING_DATABASE_URL
{"timestamp":"2026-11-23T17:06:02.676Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_INVALID_NODE_ENV
{"timestamp":"2026-11-23T17:06:05.680Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
EXIT=1

DRILL_PRODUCTION_REDACTION_MISSING_REDIS_URL
{"timestamp":"2026-11-23T17:08:33.923Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
EXIT=1
SECRET_MARKER_PRESENT=False
STACK_PRESENT=False
```

The production redaction drill failed fast during required configuration validation (missing `REDIS_URL`); it proves validation-error redaction and no stack/marker leakage. A separate exploratory boot against a synthetic unreachable database did not finish within the command window and is **not counted as a passing runtime DB-redaction drill**.

### Lint and build

```text
Command: & 'C:\Program Files\nodejs\npm.cmd' run lint
> api@0.0.1 lint
> oxlint --type-aware src/ test/
Exit: 0
Warnings: six pre-existing typescript(unbound-method) warnings in src/teams/team-collaboration-contracts.spec.ts at 116:17, 166:17, 217:17, 261:17, 277:71, and 309:17.

Command: node ./node_modules/@nestjs/cli/bin/nest.js build
Output: (no output)
Exit: 0
```

### Jest suites

Commands below ran sequentially; each emitted Node's standard `ExperimentalWarning: VM Modules is an experimental feature and might change at any time`.

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

Final total: **13 suites, 75 tests passed**. The earlier failing cap assertion was corrected before this final run.

### Diff, Docker, and PostgreSQL environment

```text
Command: git diff --check
Exit: 0
Output: no whitespace errors. Git reported line-ending normalization warnings for .github/workflows/ci.yml, api/.dockerignore, api/.gitignore, and api/Dockerfile.

Command: docker info
Client: Version 29.9.2; Context desktop-linux
Server error: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
DOCKER_EXIT=1

Command: Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

**NOT EXECUTED:** Docker image build, stop/start, container health, and image-size checks. **NOT EXECUTED:** live PostgreSQL, HTTP, redirect/cache fault-recovery, and DB-backed integration drills because Docker's Linux engine pipe is unavailable and `127.0.0.1:5432` is unreachable. UPSK CLI 0.1.30 status initially failed at `2026-11-23 16:51:44 UTC` with `Cannot reach UPSK server at api.upsk.to (connection; source: --api-url)`; its `last_error.json` was stale and described an earlier Module 05 report-payload read failure. The independent health probe then returned HTTP 200, read-only status confirmed Module 06 BUILD, and the single `upsk next` succeeded to Module 06 VERIFY.
