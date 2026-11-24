# Production Readiness — Module 05 STEP 4: Failure Mode Verification

## Scope and evidence boundary

Reviewed `progress/production-readiness/module-05/failure-mode-analysis.md` against current `src/ready.controller.ts`, `src/database/prisma.service.ts`, `src/cache/`, `src/common/bull-config.ts`, `src/analytics/`, `src/app.module.ts`, `src/main.ts`, and `src/common/http-exception.filter.ts`. No source code, `prisma/`, or `package.json` was changed. Probability values below are qualitative engineering estimates, not production incident statistics.

The previous analysis correctly distinguishes durable database writes from cache and analytics behavior. This verification adds two concrete gaps: the `/ready` 2-second response race does not cancel its underlying database query, and the analytics DB fallback catches a failed write and returns an event ID anyway. Both are visible in source and should be considered in risk prioritization.

## Failure-mode evidence table

| Failure mode | User impact | Current handling (observed) | Desired handling (distinct from current) |
|---|---|---|---|
| PostgreSQL connection refused | Link/team reads and critical writes fail; users receive generic server errors. Liveness may still be green while readiness is 503. | `DATABASE_URL` is required; `PrismaService` uses a 5 s connection timeout. `/ready` returns 503 if its database probe fails. The HTTP filter does not expose connection details. | Add dependency-specific error-rate alerts and verified recovery/runbook checks; preserve fail-closed behavior for auth and critical writes. |
| PostgreSQL slow query or lock wait | Requests slow or time out; pool slots remain occupied and unrelated requests/readiness probes may queue behind them. | HTTP server has a 30 s socket timeout. `/ready` races its query against 2 s but does not cancel the query. General Prisma statement/query/acquire deadlines are not configured here. | Configure bounded statement and pool-acquire timeouts, cancel or otherwise contain timed-out probes, measure pool waits, and shed load before saturation. |
| Redis/cache unavailable | Redirects fall back to PostgreSQL, increasing DB load; readiness is not-ready; analytics queue may use its DB fallback. | Cache operations catch failures; connection timeout is 3 s with up to 3 retry attempts. `/ready` returns 503 when Redis ping fails. Queue enqueue has a 2 s race and attempts a database fallback. | Alert on cache fallback/retry rates and budget DB fallback capacity; keep auth and critical writes fail-closed; decide readiness by the required service role rather than cache alone. |
| Stale cache / failed invalidation | A changed or deleted short link can briefly redirect to stale data, up to the 300 s TTL. | Cache invalidation is best-effort and errors are caught; Redis TTL limits stale lifetime but is not immediate consistency. | Use versioned cache keys or stronger invalidation/reconciliation and alert on invalidation failure; validate authoritative deletion/expiry where required. |
| Analytics queue unavailable and DB fallback fails | A redirect can succeed while its click event is lost, reducing analytics completeness. | `recordClick` times out queue enqueue at 2 s and attempts a direct PostgreSQL write. A failed fallback is logged and swallowed; the method still returns an event ID. | Add a durable outbox or bounded retry/dead-letter strategy and a dropped-event counter/alert; expose durable completion status internally without failing public redirects unless product requirements demand it. |
| External auth/notification API outage or latency | No current call path found, so no present user impact is established. If added synchronously, it could block workflows or create partial state. | `@nestjs/jwt` verification is local; no outbound HTTP auth/notification client was found in inspected `src/`. | Keep future integrations outside DB transactions; require request/connect deadlines, bounded retry with jitter, idempotency, circuit breaking, and an explicit degraded response. |
| Disk or filesystem full | Container logging or runtime writes can fail; a full PostgreSQL volume can reject durable writes. | Application logging goes to stdout/stderr; no application file-write path was found. Log rotation, writable-layer quotas, and database-volume capacity are deployment-owned. | Monitor filesystem, log-volume and database-volume usage/inodes; configure rotation and storage alerts; verify backups and ensure write failures never appear as committed success. |
| Node OOM / GC pressure | API or worker pauses or exits; requests/jobs are interrupted and availability depends on external restart policy. | Docker uses Node 20 slim and non-root `appuser`; Prometheus exports RSS and heap gauges. No CPU/memory cgroup limit, GC-pause alert, or heap target is configured in the inspected files. | Set container resource requests/limits and restart policy; alert on memory trend/OOM exit; profile heap and GC under representative load. |
| CPU/event-loop saturation | Request handling, timers, readiness, and worker jobs become late even if dependencies are healthy. | HTTP socket timeouts exist; current process metrics do not export CPU or event-loop lag. | Instrument event-loop delay and CPU/throttling; apply bounded concurrency/load shedding and separate API/worker resource budgets. |
| Network partition | Database calls fail; Redis fallback can amplify database load; queue connections may reconnect or remain pending. | Database connect deadline is 5 s; Redis cache connect deadline is 3 s and bounded retries; queue add times out after 2 s. Core operations do not have a universal app retry loop. | Bound all retry budgets with jitter and circuit breaking, measure fallback load, and protect the database from retry/fallback amplification. |
| DNS resolution failure | PostgreSQL/Redis can appear unavailable despite healthy services; connection attempts delay requests. | Host lookup is delegated to Node/OS and the clients; no app-level DNS timeout/retry exists. Public error responses redact resolver details. | Add sanitized resolver-error classification/alerting and runtime-network DNS checks; do not retry permanent bad names indefinitely. |
| Connection pool exhaustion | API and worker writes wait for slots, readiness can add more work, and requests time out. | `PrismaService` sets connection and idle timeouts but no explicit pool maximum or acquire timeout; `/ready`'s timed-out query is not canceled. Queue fallback shares the database. | Set explicit API/worker pool budgets against PostgreSQL `max_connections`, acquisition/query deadlines, wait metrics, and admission control. |
| Clock skew | Expiration/retention or analytics bucket boundaries may disagree across API/worker/database hosts. | Event timestamps are UTC ISO values and worker persistence uses the provided timestamp; retention uses wall clock. No clock-sync metric or skew alarm was found. | Monitor time synchronization, preserve ingress UTC time, and use database sequence/monotonic ordering for ordering invariants rather than timestamps alone. |

The “current” column reflects code, not a production deployment. Authentication and team authorization remain fail-closed: neither a cache miss nor a dependency outage is an authorization grant. A critical database mutation must not return success before durable commit. Safe cache fallback is acceptable only while DB capacity remains protected. The `app_teams_total_available` gauge marks a stale last value unavailable, but its query has no explicit timeout and the metrics scrape can wait on it.

## Failure simulations — expected vs. actual

### 1. Missing required database configuration

Expected: startup exits 1 with a message naming `DATABASE_URL`, without attempting to serve traffic. Actual compiled-app drill from an isolated temporary working directory:

```text
{"timestamp":"2026-11-23T16:20:36.193Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Result: expected behavior observed. This simulates missing configuration; it does **not** simulate an actual PostgreSQL server refusing TCP connections.

### 2. Invalid environment mode

Expected: startup exits 1 and lists supported modes. Actual:

```text
{"timestamp":"2026-11-23T16:20:39.492Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Result: expected fail-fast behavior observed; this is a deterministic configuration failure, not a transient service failure.

### 3. Production startup failure redaction

Expected: nonzero exit with a generic redacted message and no stack trace, secret, or connection URL. Actual, using synthetic environment values that were not printed:

```text
{"timestamp":"2026-11-23T16:20:42.607Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Result: no stack or synthetic secret/URL appeared. This checks startup redaction, not live HTTP error handling under a dependency outage.

### 4. Mocked queue-outage and database-readiness cases

The requested analytics/readiness command ran `src/analytics/analytics.service.spec.ts` and `src/ready.controller.spec.ts` together. Test names include `executes durable database fallback when queue is unavailable`, `returns HTTP 503 and not_ready when PostgreSQL check fails`, `returns HTTP 503 and not_ready when Redis ping returns false or fails`, and `returns HTTP 503 and not_ready when both database and redis are down`. The mocked suite observed the queue warning and successful mocked durable fallback; its assertions passed. The source-level gap remains that a failed fallback DB write is swallowed. These are mocked results, not live Redis/PostgreSQL outcomes.

## Risk ranking and engineering response

Scores use a qualitative 1–5 probability estimate multiplied by a 1–5 impact estimate. They are prioritization aids, not measured frequency.

| Rank | Failure | Probability × impact | First response |
|---:|---|---:|---|
| 1 | Slow PostgreSQL / pool exhaustion, amplified by uncanceled readiness probes and shared worker/API use | 3 × 5 = 15 | Fix first: add query/acquire bounds and cancel/contain expired probes, then instrument waits. This can cascade across otherwise healthy routes and health decisions. |
| 2 | Redis/network failure causing fallback load amplification and possible analytics loss | 3 × 4 = 12 | Put explicit budgets around fallback, measure queue fallback/drop outcomes, and protect DB capacity. |
| 3 | PostgreSQL unavailable for critical operations | 2 × 5 = 10 | Maintain fail-closed writes/auth, a truthful readiness signal, dependency alerting, and tested recovery procedures. |

The newly emphasized failure mode is the uncanceled `/ready` SQL probe: after its 2-second response deadline wins, the query may still be running and consuming a pool slot. It is easy to miss because the HTTP response looks bounded while the underlying operation is not. The swallowed analytics fallback write is another notable gap: availability is preserved, but event loss is not surfaced as a durable outcome.

Failure-mode analysis changes feature work by requiring each new dependency call to have a budget, an explicit transient/permanent classification, an observable failure signal, and a tested user-facing consequence before the feature ships. It replaces assumptions with a ranked plan for what to bound, alert on, degrade, or reject.

## Transient vs. permanent classification

| Class | Examples here | Appropriate response |
|---|---|---|
| Transient | Brief PostgreSQL/Redis restart, temporary network partition, short DNS outage, a retryable worker persistence error | Use a small bounded retry budget with backoff (and jitter for shared fleets), then fail or enter an explicitly safe degraded path. Avoid retry amplification. Existing queue jobs use 3 attempts with exponential backoff starting at 1 s; Redis cache connect retries are capped. |
| Permanent until corrected | Missing/invalid `DATABASE_URL` or `JWT_SECRET`, invalid `NODE_ENV`, invalid credentials, missing/incompatible schema/migration, nonexistent service DNS name | Fail fast or reject the operation, emit a sanitized alertable error class, and do not retry continuously. Fix configuration/credentials/schema before recovery. |
| Ambiguous; classify from evidence | Connection refused, timeout, or `ENOTFOUND` | A restart/partition may be transient; wrong host/port, bad credentials, or missing schema is permanent. Inspect sanitized error class and dependency health before retrying; never blindly loop. |

This avoids the red flags: the table assumes dependencies can fail, describes user impact for each mode, and distinguishes a bounded retryable interruption from a permanent configuration/schema defect.

## Exact verification outputs

Commands ran from `D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api`.

`& 'C:\Program Files\nodejs\npm.cmd' run lint` — exit 0; six warnings, all `typescript(unbound-method)` in the existing collaboration contract spec:

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
(node:19260) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        20.978 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand` — exit 0:

```text
(node:12740) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        22.656 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts src/metrics/metrics.controller.spec.ts --runInBand` — exit 0:

```text
(node:26152) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 5 passed, 5 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        20.463 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts|src/metrics/metrics.controller.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/analytics/analytics.service.spec.ts src/ready.controller.spec.ts --runInBand` — exit 0:

```text
[Nest] 18356  - 23/11/2026, 9:50:01 pm     LOG [AnalyticsService] [Analytics] Enqueued click job: eventId=89ee1926-d131-4a60-8eaa-8fcf3a834c75 linkId=test-link-uuid
[Nest] 18356  - 23/11/2026, 9:50:01 pm    WARN [AnalyticsService] [Analytics] Queue unavailable; applying durable database fallback (details withheld).
[Nest] 18356  - 23/11/2026, 9:50:01 pm     LOG [AnalyticsService] [Analytics] Durable fallback saved click event: eventId=9e2132a3-f0fc-47f1-a254-323648b4b0ae
[Nest] 18356  - 23/11/2026, 9:50:01 pm     LOG [AnalyticsWorker] [AnalyticsWorker] Persisted click event: eventId=evt-uuid-1 linkId=link-uuid-1
[Nest] 18356  - 23/11/2026, 9:50:01 pm    WARN [AnalyticsWorker] [AnalyticsWorker] Duplicate eventId ignored (idempotent): eventId=duplicate-evt-id
[Nest] 18356  - 23/11/2026, 9:50:01 pm   ERROR [AnalyticsWorker] [AnalyticsWorker] Failed to persist click event (eventId=retry-evt-id); details withheld.
[Nest] 18356  - 23/11/2026, 9:50:02 pm     LOG [AnalyticsService] [Analytics] Purged 7 click events older than 2026-10-24T16:20:02.049Z (retention: 30 days)
(node:18356) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        27.632 s
Ran all test suites matching src/analytics/analytics.service.spec.ts|src/ready.controller.spec.ts.
Jest did not exit one second after the test run has completed.

'This usually means that there are asynchronous operations that weren't stopped in your tests. Consider running Jest with `--detectOpenHandles` to troubleshoot this issue.
```

The analytics/readiness suite's open-handle warning is recorded; its exit code was nevertheless 0. Across the four requested Jest commands, 11 suites and 63 tests passed. The extra analytics/readiness suite is mocked/local test coverage and does not prove live dependency recovery.

`git diff --check` — exit 0; output:

```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
```

`docker info` — exit 1. The client is present (`29.9.2`, context `desktop-linux`), but the daemon error was:

```text
Server:
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

**NOT EXECUTED:** Docker build, container stop/start, live health check, or containerized failure simulation.

`Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` — exit 0:

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

**NOT EXECUTED:** live PostgreSQL failure/recovery, live `/health` or `/ready` HTTP checks, live Redis/cache/queue fault injection, and DB-backed integration tests. No live database or production environment was contacted.

## Summary

Configuration failures are reproducibly fail-fast and production-redacted; unit/mocked tests cover the application-level queue fallback and readiness decisions. The highest-priority unresolved code risks are uncanceled timed-out readiness queries, missing explicit query/pool acquisition budgets, and analytics fallback loss that is currently logged but not surfaced as a durable failure metric. Docker and live PostgreSQL/HTTP behavior remain unverified due the daemon pipe error and closed local PostgreSQL port. No changes were made to `prisma/` or `package.json`.
