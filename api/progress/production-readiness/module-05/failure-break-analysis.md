# Production Readiness — Module 05 STEP 5: BREAK Analysis

## Scope and evidence boundary

Reviewed `progress/production-readiness/module-05/verify-failure-modes.md` and the requested readiness, database, cache, queue, analytics, startup, and exception-filter code. The analysis separates the injected symptoms from observed workspace behavior. No `prisma/` or `package.json` changes were made. The localhost PostgreSQL port and Docker daemon are unavailable, so injected DNS, artificial database latency, read-only database behavior, live HTTP checks, and live recovery behavior were **NOT EXECUTED**. The diagnosis below follows the symptom and code path; it does not claim a live reproduction.

## Scenario A — DNS resolution failure while database is healthy

**Symptom:** The database container is reported running/healthy, but API requests show `ENOTFOUND`, `getaddrinfo failed`, or “Name or service not known.”

- **Diagnosis:** A healthy database process does not prove that the API can resolve the hostname in `DATABASE_URL`. These resolver errors occur before a TCP connection to the database is established. A wrong hostname/network alias or resolver failure is therefore a better first hypothesis than a database process failure. A refused TCP connection, timeout, and authentication rejection are separate failure classes and need different checks.
- **Workspace path and blast radius:** `PrismaService` passes the validated `DATABASE_URL` to the PostgreSQL adapter. Host resolution is delegated to Node/OS/client libraries; no application DNS resolver or DNS-specific retry is configured. A persistent name/configuration problem prevents API and worker database operations. During API startup it can prevent the service from becoming available; during runtime, DB-backed routes fail. Critical operations remain fail-closed. `/health` is process-only and can still report alive; `/ready` should report database down if its probe fails.
- **Detection gap:** The global exception filter intentionally masks resolver strings from clients. Its generic 5xx response protects details, but the current inspected filter records safe error codes and route context rather than a DNS-specific dependency classification. Existing alerts are mostly request-latency/error-rate or scrape-availability based; they do not identify DNS as the cause. Check resolution from the API's own network namespace, compare the configured hostname without exposing URL credentials, and inspect sanitized resolver error class.
- **Transient/permanent distinction:** A temporary resolver/network outage may merit a small bounded retry after DNS recovery. A misspelled hostname or missing DNS record is permanent until configuration/DNS is corrected; repeated retries only add delay. Do not bypass authentication or return success for critical database writes.
- **Simulation boundary:** The injected training symptom is a scenario, not a runtime result from this workspace. **NOT EXECUTED:** changing container DNS/hosts, querying DNS from the API container, or making a live PostgreSQL request; Docker named-pipe access is unavailable and port 5432 is closed.

## Scenario B — Slow dependency, not a dead service

**Symptom:** Reported response time rises from about 200 ms to 5000 ms; the liveness endpoint passes while real requests fail or become very slow.

- **Diagnosis:** A responsive process can still be blocked on a slow SQL query, lock wait, database connection acquisition, or shared pool exhaustion. A passing liveness probe establishes that the process answered that probe; it does not establish that user routes or database work meet their latency target.
- **Actual route contract:** The current workspace registers `GET /health` (returns `{ "ok": true }`) and `GET /ready`; it does not register `/live` in the inspected health/readiness controllers. Therefore the training prompt’s `/live` path is not the workspace’s liveness route. `/health` does not check dependencies. `/ready` checks PostgreSQL and Redis, and returns 503 unless both pass. Its PostgreSQL query races a 2-second timer, but the losing query is not canceled and its timer is not cleared on early query success. A request to `/ready` can return before a still-running probe finishes.
- **Latency/blast radius:** The API server sets a 30-second request timeout, 65-second keep-alive, and 66-second header timeout. There is no general SQL statement or pool-acquire deadline configured in `PrismaService`. Slow DB work can retain connections and fan out to otherwise healthy routes; `/ready` probes and metrics work can add pressure. `GET /metrics` refreshes `app_teams_total` with a DB count at most every 15 seconds and has no explicit query timeout; it keeps the last count and sets `app_teams_total_available=0` only after a failed query completes. A stalled query can delay the scrape itself.
- **Detection gap:** Route-level latency histograms and `HighLatency` can flag p95 above 0.5 seconds, but the rule requires a sustained 10-minute `for` window. `ServiceDown` detects a failed scrape, not a slow route while liveness succeeds. A 5-second user request may therefore be unhealthy well before a sustained alert fires. There is no event-loop-lag or DB pool-wait metric in the inspected exporter.
- **Desired handling:** Set bounded acquisition and statement budgets, ensure expired readiness work is canceled or isolated, instrument query/pool waits and request latency, and use admission control before the DB pool saturates. Reads may serve a clearly stale cache only where product semantics permit; writes/auth/data-integrity actions fail closed and do not report success before commit.
- **Transient/permanent distinction:** A short lock or restart delay can be transient and may justify a bounded retry for an idempotent operation. A permanently expensive query, unindexed access path, or sustained saturation needs intervention/rollback, not repeated retries.
- **Simulation boundary:** **NOT EXECUTED:** adding artificial DB latency, checking live 200 ms vs. 5000 ms API timings, or exercising `/health`/`/ready` over HTTP; PostgreSQL and Docker are unavailable. The scenario is analyzed from code and mocked tests only.

## Scenario C — Reads succeed while writes fail

**Symptom:** Users can browse content, but creates, updates, and deletes fail while monitoring reports the service up.

- **Diagnosis:** This is consistent with a database in read-only mode or a read-replica/failover state that serves reads but rejects writes. Successful `SELECT` operations do not prove that the current database role can commit mutations.
- **Workspace path and blast radius:** `/health` is independent of the database. `/ready` probes with `SELECT 1`, so a read-only database can pass that probe and be reported ready while mutation routes fail. The application’s critical mutations use PostgreSQL through Prisma; the exception filter emits a generic, sanitized 5xx envelope for unexpected failures. HTTP metrics record status and route template, and `HighErrorRate` can alert when service-scoped 5xx rate exceeds 5% for a 5-minute window and remains so for another 5 minutes. That detection is delayed and does not identify write capability specifically.
- **Detection gap:** Existing readiness verifies connectivity/read ability, not write capability. Liveness and a successful `SELECT 1` can both stay green during a write-only failure. Request error-rate alerting may eventually signal impact but has a long threshold/window and is not a write-path canary.
- **Desired handling:** Fail closed: do not acknowledge failed mutations, do not retry a non-idempotent write without idempotency protection, and do not silently switch auth/critical writes to an unverified replica. Add an explicit sanitized write-capability signal or safe synthetic write canary where operationally appropriate, fast write-error alerting, and a failover runbook that confirms the new primary before restoring mutation traffic.
- **Transient/permanent distinction:** A controlled failover/read-only window is temporary only if an approved promotion is underway; otherwise read-only mode, wrong endpoint, permissions, or missing/incompatible schema is permanent until corrected. Retry only after primary role and idempotency are confirmed. Missing schema/invalid credentials should fail fast and alert.
- **Simulation boundary:** **NOT EXECUTED:** setting PostgreSQL read-only, issuing live GET/POST requests, or testing failover/write recovery. The localhost database check returned `False` and no live HTTP server was started.

## Cross-cutting workspace gaps

| Gap | Failure consequence | Current evidence | Response priority |
|---|---|---|---|
| `/ready` timeout uses `Promise.race` without canceling the SQL query or clearing the timer | Response may be bounded while DB work continues, consuming a pool slot; the timer can also remain pending until its 2-second deadline. | `src/ready.controller.ts` lines 54–67. | High: use a cancellable/bounded DB operation and clear timers; test late completion and pool release. |
| No general statement or pool-acquire budget | Slow queries or pool saturation can tie up requests until socket/runtime limits intervene. | `src/database/prisma.service.ts` configures connection timeout 5000 ms and idle timeout 30000 ms but no general query/acquire timeout. | High: define explicit query/acquire budgets and saturation telemetry. |
| Cache invalidation is best-effort | If Redis delete fails, an old redirect target or ID can be served until its 300-second TTL expires. | `src/cache/cache.service.ts` catches invalidation errors; link mutation path awaits a best-effort operation. | Medium/High by data sensitivity: record invalidation failure and use versioned/authoritative checks for delete/expiry semantics. |
| Failed analytics DB fallback is swallowed | Redirect can complete but click data can be lost with no durable failure result or dedicated drop metric. | `src/analytics/analytics.service.ts` catches fallback write error, logs it, then returns `{ eventId }`. | Medium: distinguish queued, persisted fallback, and dropped; add durable outbox or drop metric/alert. |
| Health/readiness checks are not equivalent to user-path success | `/health` always returns process liveness; `/ready` only checks DB read + Redis ping, so write-only database failure can pass. | `src/health.controller.ts`, `src/ready.controller.ts`. | High for mutation-heavy service: document probe semantics and monitor a safe end-to-end write capability. |

## Failure-first startup drills

The compiled API was launched from a fresh temporary working directory with synthetic values so the repository `.env` could not affect the drills. Synthetic secret and connection values were not printed. These drills test configuration behavior, not service availability.

Missing `DATABASE_URL` (expected fail-fast with variable name and exit 1):

```text
{"timestamp":"2026-11-23T16:27:26.411Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Invalid `NODE_ENV=prod` (expected exit 1 and supported mode list):

```text
{"timestamp":"2026-11-23T16:27:29.654Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Production startup redaction (missing `DATABASE_URL`, production mode; expected no stack or secret values):

```text
{"timestamp":"2026-11-23T16:27:32.797Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

All three produced the expected failure. This is evidence for fail-fast config and redaction only; it does not simulate a running API losing a dependency.

## Verification outputs

All commands ran from `D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api`.

`& 'C:\Program Files\nodejs\npm.cmd' run lint` — exit 0; exact output:

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
(node:10320) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        5.642 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand` — exit 0:

```text
(node:4508) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        5.516 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts src/metrics/metrics.controller.spec.ts --runInBand` — exit 0:

```text
(node:13472) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 5 passed, 5 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        5.16 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts|src/metrics/metrics.controller.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/analytics/analytics.service.spec.ts src/ready.controller.spec.ts --runInBand` — exit 0:

```text
[Nest] 23160  - 23/11/2026, 9:57:01 pm     LOG [AnalyticsService] [Analytics] Enqueued click job: eventId=d3729f33-638c-4a08-ae82-d814b52f87ad linkId=test-link-uuid
[Nest] 23160  - 23/11/2026, 9:57:01 pm    WARN [AnalyticsService] [Analytics] Queue unavailable; applying durable database fallback (details withheld).
[Nest] 23160  - 23/11/2026, 9:57:01 pm     LOG [AnalyticsService] [Analytics] Durable fallback saved click event: eventId=390478f4-b5b0-4bdd-8c6f-dbb4944d6de5
[Nest] 23160  - 23/11/2026, 9:57:01 pm     LOG [AnalyticsWorker] [AnalyticsWorker] Persisted click event: eventId=evt-uuid-1 linkId=link-uuid-1
[Nest] 23160  - 23/11/2026, 9:57:01 pm    WARN [AnalyticsWorker] [AnalyticsWorker] Duplicate eventId ignored (idempotent): eventId=duplicate-evt-id
[Nest] 23160  - 23/11/2026, 9:57:01 pm   ERROR [AnalyticsWorker] [AnalyticsWorker] Failed to persist click event (eventId=retry-evt-id); details withheld.
[Nest] 23160  - 23/11/2026, 9:57:01 pm     LOG [AnalyticsService] [Analytics] Purged 7 click events older than 2026-10-24T16:27:01.497Z (retention: 30 days)
(node:23160) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        5.029 s
Ran all test suites matching src/analytics/analytics.service.spec.ts|src/ready.controller.spec.ts.
Jest did not exit one second after the test run has completed.

'This usually means that there are asynchronous operations that weren't stopped in your tests. Consider running Jest with `--detectOpenHandles` to troubleshoot this issue.
```

The analytics/readiness run passed 12 tests but reports an open-handle warning. Across all requested test commands, 11 suites and 63 tests passed; all are unit/mocked tests, not live fault injection.

`git diff --check` — exit 0; exact warnings:

```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
```

`docker info` — exit 1; Docker CLI client is version 29.9.2, context `desktop-linux`. Exact daemon error:

```text
Server:
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

**NOT EXECUTED:** live Docker build/run/health checks and container DNS, latency, or read-only-database fault injection.

`Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` — exit 0:

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

**NOT EXECUTED:** live PostgreSQL/HTTP/fault/recovery checks, including actual DNS failure, slow-database latency, read-only writes, `/health`, `/ready`, and failover. No non-test database was contacted.

## Summary

The injected scenarios map to distinct diagnostic layers: resolver failure before TCP, slow dependency/pool contention despite process liveness, and read-only database behavior where read probes remain green but mutations fail. Startup drills and mocked queue/readiness tests provide reproducible local evidence, but do not establish live dependency behavior. Highest-value fixes remain cancellation/budgets for readiness and queries, write-capability-aware monitoring, and an observable durable outcome for analytics fallback failures. `prisma/` and `package.json` were left untouched.
