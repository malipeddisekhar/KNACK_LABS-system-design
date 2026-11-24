# Production Readiness — Module 05 STEP 3: Failure Mode Analysis

## Scope and evidence boundary

This analysis is grounded in the current API repository as inspected on 2026-11-23: `src/app.module.ts`, `src/main.ts`, `src/common/http-exception.filter.ts`, `src/metrics/`, `src/health.controller.ts`, `src/ready.controller.ts`, `src/database/prisma.service.ts`, `src/cache/`, `src/common/bull-config.ts`, `src/analytics/`, `src/worker.ts`, `test/setup-test-db.ts`, `.env.example`, `.gitignore`, `Dockerfile`, `.dockerignore`, and the root `.github/workflows/ci.yml`. Prior readiness artifacts reviewed include Module 01 container build/fix notes, Module 02 CI build/verify/fix notes, Module 03 environment config build/verify/fix notes, and Module 04 observability build/verify/break/fix notes.

No application code, `prisma/`, or `package.json` was changed for this exercise. “Probability” in the table is a qualitative design estimate, not a measured incident rate. Unit tests and startup drills below are local evidence; Docker, PostgreSQL, and live API failure behavior could not be exercised in this environment.

## Chunk 1 — Dependency Inventory

| Dependency / resource | Connection or use | Explicit timeout / limit | Retry / backoff | Explicit behavior vs. gap |
|---|---|---|---|---|
| PostgreSQL (primary data, auth/team/link/analytics records) | Prisma Client through `@prisma/adapter-pg` / `pg`, using validated `DATABASE_URL`; test runtime is separately guarded to `TEST_DATABASE_URL` whose database name must be exactly `url_shortener_test` (`src/database/prisma.service.ts`, `test/setup-test-db.ts`). | Adapter sets `connectionTimeoutMillis: 5000` and `idleTimeoutMillis: 30000`. `/ready` races `SELECT 1` against a 2000 ms timer. No explicit general query/statement timeout or pool size/acquire budget is set in `PrismaService`; driver defaults apply. | No general application retry for core database writes. Specific link-code conflict retry exists in link creation; it is not a database-outage retry. | Required at startup; connection errors fail startup or the operation. Critical writes should remain fail-closed and transaction-scoped. The readiness timer does not cancel the underlying query, so a slow query may continue occupying a connection after `/ready` has returned. |
| Redis redirect cache | `ioredis` connects using validated `REDIS_URL`; redirect cache keys use `redirect:<code>` and `redirect_id:<code>` (`src/cache/cache.service.ts`). | Cache client `connectTimeout: 3000`, `maxRetriesPerRequest: 1`; default redirect TTL 300 seconds. No separate per-command deadline is configured. | Connection retry callback stops after 3 attempts, with 200/400/600 ms delays (bounded at 1000 ms). Cache get/set/delete failures are caught; cache reads fall through to PostgreSQL. | Optional in development/test; required by environment validation in staging/production. Cache absence/down is tolerated for redirect lookup, but `/ready` currently reports not-ready when Redis ping fails. Invalidations are best-effort, leaving a stale entry possible until TTL expiry if invalidation fails. |
| Redis / BullMQ queue | BullMQ queue and worker use Redis; `src/common/bull-config.ts` parses `REDIS_URL`. If absent, local configuration points at `127.0.0.1:6379`. | Parsed URL sets `connectTimeout: 5000`, `lazyConnect: true`, and `maxRetriesPerRequest: null`. The no-URL local fallback does not set these timeout options. `AnalyticsService.recordClick` races enqueue against 2000 ms. | Click job has 3 attempts with exponential backoff starting at 1000 ms; failed worker persistence is rethrown for BullMQ retry. Queue connection retry defaults are not explicitly bounded in this config. | Queue outage triggers a direct PostgreSQL click-event fallback. That fallback write is caught and logged but not rethrown; redirects can still complete while analytics data is lost. P2002 is treated idempotently; P2003 for a removed parent link is ignored. This is an intentional availability choice for non-critical analytics, but loss needs a metric/alert. |
| Authentication / JWT | Local JWT verification via Nest `@nestjs/jwt` and configured `JWT_SECRET`; no external identity-provider HTTP client was found in the inspected `src/` tree. | No outbound auth request timeout applies. Token verification is local process work. | No network retry. Invalid/missing credentials are rejected; required secret is validated at startup. | No external auth API dependency is configured. Fail closed on missing/invalid credentials and never bypass auth because another dependency is unavailable. |
| External HTTP / notification APIs | Search of application `src/` found no `fetch`, Axios/`HttpService`, `http(s).request`, or notification-provider client. | Not applicable to current code. | Not applicable. | Do not infer a provider dependency from product concepts; if one is introduced, require explicit connect/request deadlines, bounded retries with jitter, idempotency, and a circuit breaker before release. |
| Filesystem, temp files, and logs | Application logger writes JSON to stdout/stderr. No application file-write/temp-file API use was found in `src/`. `test/setup-test-db.ts` does read `.env` to locate an explicit `TEST_DATABASE_URL`; it never derives it from `DATABASE_URL`. Docker excludes environment files and progress/docs from build context. | No application log-file rotation or disk quota is configured in source. Docker image is multi-stage, non-root, and has a `/health` probe; filesystem quotas are deployment-owned. | None in the application. Container/log-driver rotation is external. | Logs avoid stack/connection details and go to process streams. A full container writable layer or host log volume can still disrupt runtime/log collection; external storage and rotation must be monitored. |
| DNS / service-name resolution | PostgreSQL and Redis hostnames in their URLs are resolved by the OS/Node networking stack and underlying clients. No custom resolver is present. | No application-level DNS timeout is set. Connection deadlines bound some connection attempts, but DNS behavior within those attempts is library/OS-managed. | No application DNS-specific retry/backoff. Redis client reconnect policy is the only explicit related retry. | `ENOTFOUND`/resolver failures surface as service connection errors; core database access fails closed. Runbooks should distinguish name resolution from refused ports and authentication failures without logging full URLs. |
| Node.js / container runtime | API runs on Node 20 slim in the Dockerfile as non-root `appuser`; API binds `0.0.0.0` on configured port. Worker is a separate Node process. | HTTP server: request/socket timeout 30 s, keep-alive 65 s, headers timeout 66 s. No CPU or memory cgroup limit is declared in the Dockerfile. No explicit V8 heap/GC flags or event-loop-lag threshold is configured. | Process restart policy is orchestration-owned; no restart policy is declared in the Dockerfile. Worker shutdown has a 10 s drain timeout. | Metrics expose process uptime, RSS, heap used, and heap total, but not CPU saturation, event-loop lag, GC pauses, or container throttling. Health `/health` is process-only; `/ready` is dependency-aware. |
| System clock | Node timestamps are produced in UTC ISO strings for events/logs; expiration/retention use `Date.now()`. Worker persists event timestamp values. | No app clock-skew bound. | No application retry; time synchronization is an OS/platform responsibility. | Multiple hosts with skew can disagree on expiry, retention cutoffs, and time buckets. Preserve ingress UTC timestamps, monitor host time sync, and avoid treating wall-clock timestamps as a monotonic ordering source. |

### Configuration and readiness notes

`validateEnvironment` requires explicit `NODE_ENV`, `PORT` outside tests, `JWT_SECRET`, and `DATABASE_URL`; staging/production additionally require `REDIS_URL` and `PUBLIC_BASE_URL`, enforce explicit origins, HTTPS in production, and restrict log verbosity. `RETENTION_DAYS` defaults to 30. `GET /health` returns `{ "ok": true }` without checking dependencies. `GET /ready` checks PostgreSQL and Redis in parallel and returns HTTP 503 unless both are up; each check has a 2-second response deadline. The Redis requirement for readiness is stricter than cache fallback alone because Redis also backs BullMQ in production.

`GET /metrics` uses route-template labels and a capped series set. `app_teams_total` is refreshed at most every 15 seconds; on query failure the last value remains but `app_teams_total_available` becomes 0. The query has no explicit timeout and the scrape endpoint is not application-authenticated; deployment network policy must restrict it to the Prometheus scrape network.

## Chunk 2 — Failure Mode Table

| Failure mode | Probability (qualitative) | User / system impact | Current handling in this workspace | Desired handling / stance |
|---|---|---|---|---|
| PostgreSQL connection refused or unavailable | Medium | Startup may fail; link/team/auth-dependent operations fail; critical writes cannot persist. `/health` can remain green while `/ready` returns 503. | `DATABASE_URL` is mandatory; Prisma connection deadline is 5 s; readiness query has a 2 s response race; global filter returns a generic 5xx envelope without connection details. | **Fail closed** for auth-dependent reads and critical writes. Keep readiness red, do not accept critical writes without durable commit, alert on readiness/database connection errors, and recover only after DB health is confirmed. |
| PostgreSQL slow query / lock wait | Medium | Elevated API latency, eventual socket timeout, pool occupancy, blocked readiness/metrics, and possible cascading failures. | HTTP server timeout is 30 s; `/ready` races DB probe at 2 s but cannot cancel that query; no general SQL statement/query timeout is set in `PrismaService`. Metrics gauge query is cached 15 s but lacks a query deadline. | Add bounded statement/acquire deadlines, cancellation where supported, slow-query and pool-wait telemetry, and admission control. Do not return success for a critical mutation until its transaction commits. |
| Readiness probe timeout handle remains scheduled after a quick result | Low–Medium | A healthy probe can return while a redundant 2 s timer remains active, delaying shutdown/test completion; a timed-out SQL query also continues because `Promise.race` does not cancel its losing operation. | Before the fix, `/ready` raced DB and Redis operations against 2 s timers without clearing handles on success or failure. Timeout did not abort SQL. | Clear timeout handles in `finally` whenever either side settles, keep a fixed sanitized diagnostic log and 503 message for dependency failure. Treat cancellation of the underlying SQL as a separate limitation unless the driver provides safe cancellation. |
| Redis/cache unavailable | Medium | Cache misses increase PostgreSQL load; queue events may be delayed or use fallback; readiness is 503. | Cache operations catch errors and redirect lookup falls back to PostgreSQL; cache retries stop after 3 attempts. Queue add has a 2 s deadline and attempts a DB fallback for analytics. | Degrade cache reads to DB only while protecting DB capacity; retain readiness signal for the queue dependency; alert on Redis connection/retry/fallback rates. Auth, authorization, and critical writes must never fail open because Redis is down. |
| Stale or inconsistent redirect cache | Low–Medium | Redirect may return an old target or a deleted link during the 5-minute TTL window; analytics may see a mismatched link ID. | `CacheService` sets 300 s TTL and invalidates target/id keys on link mutations, but invalidation errors are swallowed; stale values can remain until expiry. | Keep versioned keys or stronger invalidation/reconciliation; for security-sensitive or deleted/expired records, verify authoritative state before serving cached data. Measure invalidation failures and treat them as actionable signals. |
| External API outage | Not applicable to current app; future risk | No current external provider is called from the inspected API source. A future provider could block user workflows or leave partial state. | No outbound HTTP auth/notification integration found. | On introduction, isolate provider calls from DB transactions, use bounded timeouts, bounded/jittered retries, circuit breaker, idempotency, and explicit degraded UX. Keep authorization and critical persistence fail-closed. |
| External API slow / tail latency | Not applicable to current app; future risk | No present external HTTP call path to measure. Future synchronous calls could consume request slots and amplify latency. | No provider client or request timeout found. | Set end-to-end budgets below HTTP timeout, instrument provider latency, and move non-critical notifications to an outbox/queue. |
| Disk/filesystem full | Low–Medium; deployment-dependent | Container logs may stop persisting; temp/write operations can fail; a full Postgres volume can reject writes and threaten service recovery. | API logs use stdout/stderr; no application file-write path found. Database storage and log rotation are external. Docker image excludes local docs/secrets and runs non-root, but no runtime volume quota is set here. | Alert on host/container writable-layer, log-volume, and DB-volume utilization/inodes; rotate logs; keep DB backups and tested retention; handle write errors without claiming a durable commit. |
| Node OOM / GC pressure | Medium under unbounded load | Process exits or pauses; requests drop; worker may retry; container restart behavior depends on orchestrator. | Dockerfile uses Node 20 slim and non-root user; metrics expose RSS/heap. No memory limit, heap target, GC-pause or OOM alert is configured in app/container files. | Set workload-appropriate container memory limits and restart policy; alert on RSS/heap trend and OOM exit; profile allocation/GC before raising limits. Keep startup/health behavior truthful during restart loops. |
| CPU or event-loop saturation | Medium under burst / pathological workload | Timers, request processing, metrics, and queue work become late; health checks can time out even with dependencies healthy. | HTTP timeouts bound some sockets; process metrics do not expose CPU, event-loop lag, or GC pause. No app-level concurrency cap is visible in this inventory. | Add event-loop lag/CPU/throttling signals, bounded concurrency and load shedding, route SLO alerts, and separate worker/API resource budgets. |
| Network partition between API, Redis, and PostgreSQL | Medium | Requests time out or fail, retries add load, data access degrades; queue fallback may increase DB pressure during a Redis outage. | DB connection timeout 5 s, Redis cache connection timeout 3 s/retry cap; queue add times out at 2 s. DB/Redis failures are converted to not-ready or generic error responses. | Use bounded retry budgets with jitter, circuit breakers, dependency-specific saturation alarms, and ensure fallback capacity is budgeted. Fail closed for durable critical mutations. |
| DNS resolution failure / stale service record | Low–Medium; environment-dependent | DB/Redis connection fails although the service may be healthy; repeated client retries can delay recovery. | Host resolution is client/OS-managed; no DNS-specific resolver deadline or retry policy is configured. Errors are withheld from public responses/log details. | Monitor resolver errors separately, alert on `ENOTFOUND`/lookup failures using sanitized error classes, validate service DNS from the runtime network, and avoid logging credentials in URLs. |
| Connection pool exhaustion | Medium under slow queries, bursts, or worker contention | Requests wait for a DB connection, `/ready` probes may consume more work, queue fallback writes compete with API writes, and HTTP requests fail/timeout. | No explicit pool maximum/acquire timeout is set in `PrismaService`; adapter connection/idle timeouts are set. `/ready` has a 2 s race without canceling the query. | Explicitly budget shared API/worker pool size against DB `max_connections`; set acquire/statement timeouts; instrument active/idle/waiting counts; shed load before saturation. |
| Clock skew between API, worker, DB, or hosts | Low–Medium; multi-host dependent | Expiry and retention boundaries can shift; delayed jobs can land in an unexpected bucket; event order inferred from timestamps can be misleading. | API captures event timestamps in UTC and worker persists them; expiration/retention use wall clock. No clock-sync health metric or skew alarm is configured. | Synchronize clocks (NTP/platform), alert on offset, preserve ingress UTC timestamp, use database monotonic sequence/order for ordering invariants, and test boundary cases. |

### Fail-closed policy applied

- JWT validation, team role checks, and critical database mutations do not get a “continue anyway” path when their authoritative inputs are unavailable.
- Database transaction errors must prevent reporting successful critical state changes; API responses remain generic and sanitized.
- Cache failure may degrade to an authoritative PostgreSQL read for redirects, provided fallback load remains safe; stale cache is not authoritative for deletes/expiry.
- Analytics is explicitly lower criticality: queue failure attempts a direct database write so redirect requests are not held indefinitely. Current code also swallows failure of that fallback, so a dropped-event counter/alert is a recommended follow-up rather than claiming lossless analytics.
- The team-count metric is allowed to be stale if its availability gauge is 0; dashboards and alerts must not interpret the last value as fresh.

## Chunk 3 — Failure Simulation and Verification

### Failure-first startup drills

The compiled application was invoked from a newly created temporary working directory, with synthetic non-production values and no workspace `.env` in that working directory. The synthetic values were not printed. These are configuration-only startup tests; no listener or external service was started.

Missing `DATABASE_URL` (`NODE_ENV=development`; expected configuration failure naming the variable):

```text
{"timestamp":"2026-11-23T16:09:53.399Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Invalid `NODE_ENV=prod` (expected exit 1 and supported mode list):

```text
{"timestamp":"2026-11-23T16:09:56.672Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Production startup redaction (`NODE_ENV=production`, missing `DATABASE_URL`, synthetic secret/URL values supplied for other fields; expected no stack or secret):

```text
{"timestamp":"2026-11-23T16:09:59.657Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
EXIT=1
```

Observed: all three drills exited 1 as intended; the production output omitted validation detail, stack, and synthetic secret/connection values. Configuration behavior is directly exercised; live dependency failure behavior is not established by these drills.

### Requested local verification commands

All commands below ran from `D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api`. Exit codes are from the current run.

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
(node:18604) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        7.293 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand` — exit 0:

```text
(node:17060) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        6.994 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

`node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts src/metrics/metrics.controller.spec.ts --runInBand` — exit 0:

```text
(node:1320) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 5 passed, 5 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        6.219 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts|src/metrics/metrics.controller.spec.ts.
```

Additional safe failure-oriented coverage: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/analytics/analytics.service.spec.ts src/ready.controller.spec.ts --runInBand` — exit 0, 2 suites and 12 tests passed. The command also emitted: `Jest did not exit one second after the test run has completed.` (open-handle warning); do not treat this warning as a clean teardown proof.

`git diff --check` — exit 0. Git emitted only line-ending conversion warnings for `.github/workflows/ci.yml`, `api/.dockerignore`, `api/.gitignore`, and `api/Dockerfile`; no whitespace error was reported.

### Infrastructure checks and expected-vs-actual result

`docker info` — exit 1. Docker CLI was present (client 29.9.2, context `desktop-linux`), but the daemon could not be reached:

```text
Server:
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
```

Expected: daemon status should establish whether the container runtime can be exercised. Actual: named-pipe target is absent. **NOT EXECUTED:** Docker build, container stop/start, container health probe, image-size check, and container-level dependency fault injection.

`Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` — command exit 0; result `False`:

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Expected for a live PostgreSQL drill: a listening test database at the guarded `url_shortener_test` target. Actual: no TCP listener at `127.0.0.1:5432`. **NOT EXECUTED:** live PostgreSQL failure/recovery checks, live `/health` or `/ready` HTTP probes, live cache/queue failure simulation, DB pool saturation, and database-backed integration tests. No production or non-test database was contacted.

The test suites provide mocked/unit evidence for configuration validation, error redaction, queue fallback/retry behavior, readiness decisions, metrics and request logging. They do not substitute for Docker or live DB/HTTP failure injection. The additional Jest command passed but reported an open-handle warning, which remains a teardown concern for that suite.

### UPSK connectivity attempt

The initial read-only UPSK status attempt failed with:

```text
{"timestamp_unix_ms":1795450061757,"level":"error","message":"command.failed","context":{"command":"status"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

The first direct HTTPS health probe failed with `No such host is known. (api.upsk.to:443)` under the restricted network. One network-approved retry returned `HTTP 200` and `{"ok":true,"version":"v1"}`. A read-only status query then confirmed Production Readiness / Practitioner / Module 05 / BUILD. The single `upsk next` attempt returned exit 0, `progression_result: "recorded"`, and `advanced_to_next_step`; the active checkpoint is now Module 05 / VERIFY. The next-step prompt asks for at least 8 failure modes, at least 2 simulated failures with actual results, desired handling distinct from current handling, one newly recognized failure mode, a risk-ranked top three, analysis-vs-hope reflection, and transient-vs-permanent failure classification with appropriate retry or fail-fast handling.
