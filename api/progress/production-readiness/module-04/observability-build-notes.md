# Production Readiness — Module 04 BUILD: Observability

## Chunk 1 — JSON-always structured logging

The selected format is `json_always`. `AppLogger` writes one newline-delimited JSON object per line directly to stdout or stderr; it does not pass JSON through Nest's human-readable prefix formatter. Every record contains `timestamp` (ISO 8601), `level`, `message`, `service_name`, and `request_id`. The API uses service name `url-shortener-api`; the separate queue worker uses `url-shortener-worker`. Request records also include bounded `method`, route-template `path`, `status_code`, and `duration_ms`; error records include the stable `error_code`.

`RequestIdMiddleware` preserves an incoming `X-Request-ID` only when it contains 1–128 ASCII letters, digits, dot, underscore, or hyphen. Otherwise it creates a UUID. It attaches that value to the request and returns it in the `X-Request-ID` response header. The request logger and exception filter use that same ID. Startup/system records include the field with JSON `null` where no request exists. The API bootstrap installs `AppLogger` as Nest's logger; the worker application context does the same. Raw request paths, query strings, exception stacks, and Nest logger stack arguments are not logged. Messages containing recognizable credential labels, bearer tokens, service URLs, connection failures, or stack traces are replaced with a fixed withheld-details message.

Severity policy: `info` for completed requests and startup events, `warn` for recoverable degradation, and `error` for request/server failures. `LOG_LEVEL` controls `info`/`warn`/`error` filtering, while startup and error events remain visible. `debug` and `verbose` remain disallowed in staging/production by the existing environment validator.

## Chunk 2 — Prometheus pull metrics

`GET /metrics` returns Prometheus text exposition with content type `text/plain; version=0.0.4; charset=utf-8`. It exposes:

- `http_requests_total{method,path,status}` — a counter incremented once when the response finishes.
- `http_request_duration_seconds` — a histogram with buckets `0.005`, `0.01`, `0.025`, `0.05`, `0.1`, `0.25`, `0.5`, `1`, `2.5`, `5`, and `10` seconds, plus `+Inf`, sum, and count.
- `app_teams_total` — a gauge from a fixed `SELECT COUNT(*) FROM "teams"` query, cached for 15 seconds. `app_teams_total_available` reports whether its latest refresh succeeded; a failed query retains the last value, marks it unavailable, and emits no database error details.
- `process_uptime_seconds`, `process_resident_memory_bytes`, `process_heap_used_bytes`, and `process_heap_total_bytes` — process/runtime gauges.

Label cardinality is bounded: the middleware uses Express's registered route template (`req.route.path`), never the raw URL or path; methods are restricted to common HTTP methods or `OTHER`; valid status labels are 100–599; and the in-memory registry caps series at 500. A new series beyond the cap is folded into `OTHER/other/overflow` and increments the unlabeled `http_requests_overflow_total` counter, so capacity overflow cannot masquerade as an HTTP 500. Request IDs, query strings, short codes, team IDs, and arbitrary user values are not metric labels. Keep `/metrics` reachable only from the Prometheus scrape network at deployment.

## Chunk 3 — Alert definitions

Rules are in `monitoring/alerts.yml`; they should be loaded into the production Prometheus rule configuration. Alert runbook references point to the corresponding heading in this document. Thresholds intentionally use sustained windows to reduce noise without delaying urgent failures:

| Alert | Expression / threshold | `for` | Severity | Response |
|---|---|---:|---|---|
| `HighErrorRate` | Service-scoped 5xx request rate / total request rate `> 0.05` over 5m | 5m | `page` | Check recent deployments, dependency health, and request/error logs correlated by request ID. |
| `HighLatency` | Per-job/method/route p95 from histogram buckets `> 0.5` seconds over 5m | 10m | `warn` | Use the alert's route labels, then compare readiness/dependency status before scaling or rollback. |
| `ServiceDown` | `up{job="url-shortener-api"} == 0` | 1m | `page` | Check target health, container/process state, recent release, and `/ready`; use `/health` for process liveness. |
| `ServiceTargetMissing` | `absent(up{job="url-shortener-api"})` | 1m | `page` | Check scrape target configuration and job-label drift; a separate dead-man's switch is still needed if Prometheus itself is down. |
| `MetricLabelOverflow` | `increase(http_requests_overflow_total{job="url-shortener-api"}[5m]) > 0` | 1m | `warn` | Investigate new route/status series and confirm per-status error rates are not losing detail. |

### High error rate

Confirm the scrape target and affected route templates. Correlate request IDs with `http_request_failed` records. Compare error-rate change to deployment time, then inspect `/ready` and dependency health before rollback.

### High latency

Use histogram buckets and route-template labels to locate the slow path. Compare `/ready`, database/cache availability, and deployment changes. Do not use raw URLs or IDs as grouping labels.

### Service down

Check orchestration/container state and `/health` liveness; then inspect `/ready` for dependency readiness. Roll back the last known-bad release if the incident aligns with deployment and the prior version is safe.

## Verification record

Commands ran from `D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api`. No package dependency or Prisma schema/migration was added or changed for observability. `prom-client` is not used; the exporter relies on existing Nest, Node, Express, and Prisma APIs.

### Startup failure-first drills

The compiled startup was launched from the system temporary directory with synthetic values so a workspace `.env` could not override test inputs. No secrets were printed.

```text
=== missing DATABASE_URL startup drill ===
{"timestamp":"2026-11-23T09:29:20.413Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
exit=1
=== invalid NODE_ENV=prod startup drill ===
{"timestamp":"2026-11-23T09:29:22.663Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
exit=1
=== production redaction startup drill ===
{"timestamp":"2026-11-23T09:29:24.841Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
exit=1
```

All startup output is a JSON record with the required base fields; production output contains no stack or configuration value.

### Lint

Command: `& 'C:\Program Files\nodejs\npm.cmd' run lint`

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

Exit code: `0`; six existing warnings in the team contract spec.

### Nest build

Command: `node ./node_modules/@nestjs/cli/bin/nest.js build`

```text
<no stdout or stderr>
```

Exit code: `0` after the initial build identified and corrected the stale generated-client accessor by using the fixed raw count query.

### Configuration/exception tests

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand`

```text
(node:13116) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        13.117 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```

Exit code: `0`.

### Team regression tests

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand`

```text
(node:27472) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        12.99 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

Exit code: `0`.

### New observability tests

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts --runInBand`

```text
(node:18508) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 5 passed, 5 total
Tests:       9 passed, 9 total
Snapshots:   0 total
Time:        11.498 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/metrics/metrics.controller.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts.
```

Exit code: `0`. Tests cover JSON fields and diagnostic redaction, safe request-ID preservation/regeneration, bounded route labels, Prometheus counter/histogram/gauges, and a failed team-count query without exposing the database error.

### Whitespace

Command: `git diff --check`

```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', LF will be replaced by CRLF the next time Git touches it
```

Exit code: `0`; no whitespace errors, only the existing line-ending normalization warnings above.

### Alert YAML parse

Command: `node -e "const fs=require('fs'); const yaml=require('js-yaml'); const doc=yaml.load(fs.readFileSync('monitoring/alerts.yml','utf8')); console.log(JSON.stringify({groups:doc.groups.length,alerts:doc.groups[0].rules.map(x=>x.alert)}))"`

```text
{"groups":1,"alerts":["HighErrorRate","HighLatency","ServiceDown"]}
```

Exit code: `0`.

### Docker daemon

Command: `docker info`

```text
Version:    29.9.2
Context:    desktop-linux
Server:
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Exit code: `1`. Docker build/run/health checks are **NOT EXECUTED**.

### PostgreSQL

Command: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet`

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Live PostgreSQL/HTTP checks are **NOT EXECUTED**. Unit tests use mocks; the metrics route was not live-scraped in this environment.

## Deployment gates and limitations

The Prometheus server must scrape the API with job label `url-shortener-api`, load `monitoring/alerts.yml`, and restrict network access to `/metrics`. The exact scrape target, alert receiver, notification policy, and deployed runbook URL are environment-specific and remain deployment work. Docker and PostgreSQL/HTTP checks above were not executed; a local Nest build and mocked tests are not substitutes for scrape, database, container, or production verification.

## UPSK checkpoint attempt

The approved health probe returned `HTTP 200` and `{"ok":true,"version":"v1"}`, but CLI status and advancement remained unreachable. CLI version: `upsk 0.1.30`. `status --json` failed at `2026-11-23 09:34:51.703 UTC`; the one `next` attempt failed at `2026-11-23 09:35:02.704 UTC`:

```text
{"timestamp_unix_ms":1795426502704,"level":"error","message":"command.failed","context":{"command":"next"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

The local `last_error.json` still refers to an older Module 05 report-file read error and contains no current correlation, request, or error IDs. No Module 04 checkpoint advancement is claimed.
