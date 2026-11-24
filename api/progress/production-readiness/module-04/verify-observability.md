# Production Readiness — Module 04 STEP 4: VERIFY

## Source review

Inspected src/common/app-logger.service.ts, src/common/http-route.ts, src/common/http-exception.filter.ts, src/request-id.middleware.ts, all files under src/metrics/, monitoring/alerts.yml, and the existing BUILD notes. The implementation follows json_always logging and pull_prometheus metrics. This verification pass did not modify prisma/ or package.json.

### Structured logging and request correlation

AppLogger emits one JSON object per line with timestamp, level, message, service_name, and request_id. Startup uses null for request_id; API and worker use url-shortener-api and url-shortener-worker. Completion logs also contain bounded method/path/status/duration; error logs use a stable error code. Non-string logger payloads are omitted. Recognized credentials, bearer tokens, service URLs, connection failures, and stack/error markers are withheld.

RequestIdMiddleware preserves X-Request-ID only when it matches 1–128 ASCII letters, digits, dot, underscore, or hyphen; otherwise it generates a UUID. The ID is attached to the request and returned in the response header. Completion logging runs at response finish. Route labels use safe route templates (unmatched/raw paths become unmatched); methods outside the fixed allowlist become OTHER.

The exception filter returns generic text for unexpected errors and all 5xx responses. It sanitizes recognized sensitive details from 4xx messages and never serializes stack traces. The production startup drill below confirms its redacted startup error path. This verifies known patterns and samples, not every possible sensitive string.

### Metrics and alert rules

GET /metrics declares text/plain; version=0.0.4; charset=utf-8. The exporter provides http_requests_total{method,path,status} counter; http_request_duration_seconds histogram with buckets, sum, and count; app_teams_total and app_teams_total_available gauges; and process uptime/RSS/heap gauges. Team count uses a fixed SQL query cached for 15 seconds; failures do not expose database details.

Labels use normalized methods, integer statuses, and route templates—never raw URLs, query strings, IDs, or request IDs. The series map caps at 500 and folds overflow into OTHER/other/500. MetricsController has no app auth guard, so deployment must restrict /metrics to the Prometheus scrape network.

monitoring/alerts.yml defines HighErrorRate (>5% 5xx rate over 5m, for 5m, page), HighLatency (p95 >500 ms, for 10m, warn), and ServiceDown (up == 0, for 1m, page). All include severity, summary, description, and runbook links. YAML parsing found one group and all three names. Loading the rules, scrape target/receiver setup, and live Prometheus verification remain deployment work.

## Verification outputs

Commands ran from D:/KNACK SEKHAR LAB/upsk-system-design-workspace/api. Exit codes are recorded as observed.

### Startup failure-first drills

The compiled entry point ran from a fresh temporary working directory with synthetic environment values, so a workspace .env could not supply them. Synthetic credential and URL values were not printed.

```text
=== missing DATABASE_URL ===
{"timestamp":"2026-11-23T09:41:33.460Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
exit=1
=== invalid NODE_ENV=prod ===
{"timestamp":"2026-11-23T09:41:35.726Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
exit=1
=== production redaction on startup failure ===
{"timestamp":"2026-11-23T09:41:38.054Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
exit=1
```

### Lint

Command: & 'C:\Program Files\nodejs\npm.cmd' run lint

```text
> api@0.0.1 lint
> oxlint --type-aware src/ test/

src/teams/team-collaboration-contracts.spec.ts:116:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:166:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:217:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:261:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:277:71: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
src/teams/team-collaboration-contracts.spec.ts:309:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
```

Exit code: 0; six existing warnings are in the team contract spec.

### Nest build

Command: node ./node_modules/@nestjs/cli/bin/nest.js build

```text
<no stdout or stderr>
```
Exit code: 0.

### Configuration and exception tests

Command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand

```text
(node:25264) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        8.599 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```
Exit code: 0.

### Team regression tests

Command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

```text
(node:2060) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        8.584 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```
Exit code: 0.

### Observability tests

Requested command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts --runInBand

```text
(node:29288) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 4 passed, 4 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        6.805 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts.
```
Exit code: 0.

Additional metrics controller/content-type test: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.controller.spec.ts --runInBand

```text
(node:19264) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        1.873 s
Ran all test suites matching src/metrics/metrics.controller.spec.ts.
```
Exit code: 0. Across all four Jest invocations, 9 suites and 46 tests passed; Node emitted the shown experimental VM modules warning.

### Alert YAML parse

Command: node -e "const fs=require('fs');const doc=require('js-yaml').load(fs.readFileSync('monitoring/alerts.yml','utf8'));console.log(JSON.stringify({groups:doc.groups.length,alerts:doc.groups[0].rules.map(x=>x.alert)}))"

```text
{"groups":1,"alerts":["HighErrorRate","HighLatency","ServiceDown"]}
```
Exit code: 0.

### Whitespace check

Command: git diff --check

```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', LF will be replaced by CRLF the next time Git touches it
```
Exit code: 0; no whitespace errors, only the line-ending normalization warnings shown.

### Docker

Command: docker info

```text
Client:
 Version:    29.9.2
 Context:    desktop-linux
 Debug Mode: false
Server:
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```
Exit code: 1. Docker build, run, and health checks are NOT EXECUTED because Docker Engine named-pipe access is denied.

### PostgreSQL and live HTTP

Command: Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```
Probe process exit code: 0; TCP result: False. Live PostgreSQL-backed checks, API HTTP calls, and live Prometheus scrapes are NOT EXECUTED. Metrics/logger evidence is source review and mocked/unit evidence, not live service evidence.

## UPSK checkpoint

Read-only upsk status --json returned:

```text
{"timestamp_unix_ms":1795426782613,"level":"error","message":"command.failed","context":{"command":"status"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

Checkpoint advancement is not confirmed unless the requested upsk next response succeeds.

### Latest UPSK reachability and advancement attempt — 2026-11-23 09:50:22 UTC

The first read-only HTTPS health probe failed DNS resolution with `No such host is known. (api.upsk.to:443)`. The one retry using the previously approved network access returned `HTTP 200` and `{"ok":true,"version":"v1"}`. Following that result, `upsk status --json` and the single `upsk next` attempt both failed at the CLI connection layer; the direct health response does not establish that the CLI API route is reachable.

Exact status output:

```text
{"timestamp_unix_ms":1795427393225,"level":"error","message":"command.failed","context":{"command":"status"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

Exact advancement output:

```text
{"timestamp_unix_ms":1795427405005,"level":"error","message":"command.failed","context":{"command":"next"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

CLI version: `upsk 0.1.30`. The local `last_error.json` is stale: it records an earlier `report` payload-read failure for `progress\ai-augmented-engineering\module-05\module-05-report.json`, captured at Unix time `1795362142645`, with null status/code and no correlation/request/error IDs. It does not describe this Module 04 VERIFY attempt. Checkpoint advancement remains unconfirmed.
