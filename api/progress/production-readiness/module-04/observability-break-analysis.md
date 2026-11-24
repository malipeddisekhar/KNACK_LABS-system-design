# Production Readiness — Module 04 STEP 5: BREAK

## Scope and method

Reviewed the logger, route-safety helpers, exception filter, request-ID middleware, every metrics source/spec file, the alert rules, and the Step 4 verification report. This is a source-and-mocked-test audit; Docker is inaccessible and PostgreSQL is not reachable, so no live HTTP scrape or DB-backed behavior is inferred. No application code, prisma/, or package.json was changed in this BREAK pass.

## Failure-mode analysis

| Priority | Failure mode and production effect | Current mitigation/evidence | Residual risk / follow-up |
|---|---|---|---|
| High | `/metrics` has no application auth guard. Public exposure can disclose traffic patterns, process memory, and team counts; scrapers or other callers can also trigger refresh work. | MetricsController is a bare GET controller; the BUILD/VERIFY notes call for network restriction. | Enforce ingress/network allowlisting and authenticate or isolate the scrape endpoint; verify deployed routing. No live exposure test ran. |
| High | Sensitive-detail filtering is pattern-based. Unrecognized secrets or PII embedded in free-form AppLogger messages or 4xx validation/domain messages may pass through. | Known credential labels, bearer tokens, connection strings, stack markers and error classes are withheld; 5xx and unexpected errors are generic. Tests cover representative sensitive samples. | Prefer allowlisted structured fields and safe error codes over arbitrary messages. Add adversarial cases for email/PII, encoded values, multiline payloads, and secrets without labels. Current tests cannot prove universal redaction. |
| High | ServiceDown only fires when an `up{job="url-shortener-api"}` series exists with value 0. A removed/mistagged target, missing series, or a failed Prometheus server may produce no alert. | Rule has a one-minute `for` duration and pages on a failed scrape. | Add absent-target detection and an independent dead-man's-switch/synthetic monitor; confirm scrape interval and alert receiver in deployment. |
| Medium | HighErrorRate aggregates all jobs and request labels, and its 5m rate window plus `for: 5m` delays a sustained page. Low traffic and the denominator floor can make the ratio insensitive; completed-response instrumentation also omits requests that never finish. | Uses 5xx/total and `clamp_min(..., 0.001)` to avoid division by zero; sustained threshold reduces noisy pages. | Scope by `job="url-shortener-api"`; tune low-volume behavior and alert latency; pair with availability/timeout signals. PromQL was YAML-parsed but not checked by promtool or a live Prometheus. |
| Medium | HighLatency computes one global p95 across all routes/statuses. A heavily used fast path can dilute a slow critical endpoint. The 5m range plus 10m hold increases detection delay. | Histogram is emitted with method/path/status labels and has finite buckets plus +Inf. | Alert per job and route (or critical route group), select SLO-based thresholds, and validate with production-like scrape data. |
| Medium | Series-cap overflow intentionally maps new series to `OTHER/other/500`; the synthetic status 500 can misclassify successful traffic, inflate the 5xx rate, and distort the histogram. | Route templates, fixed method/status labels, and a 500-series cap bound memory; a unit test confirms overflow is bounded. | Treat overflow as an explicit dropped/overflow series without a fabricated HTTP status, add an overflow counter/alert, and test that overflow cannot affect error-rate semantics. |
| Medium | app_teams_total can be stale for up to its 15s refresh interval. When refresh fails, the last value is still exported while availability is 0; consumers ignoring that gauge may treat stale data as current. A metrics request awaits the DB query with no metrics-specific timeout visible here. | Fixed SQL; refresh is cached; errors are caught without logging the DB error, and app_teams_total_available becomes 0. | Alert/dashboard on availability, document gauge freshness, and put a bounded timeout/bulkhead around collection. Live query latency, table compatibility and scrape behavior are NOT EXECUTED. |
| Medium | Request IDs supplied by clients are validated but not regenerated if syntactically valid. A caller can reuse one ID to merge unrelated log traces or deliberately create confusing correlations. | Length is capped at 128 and allowed characters exclude control characters; the value is echoed for support correlation. | Strip untrusted inbound IDs at the edge or generate a server-owned ID and store a separately bounded upstream trace ID. Test repeated-ID abuse at the edge. |
| Medium | Route-template safety checks allowed characters and length, but do not semantically prove a value is a template. Current middleware reads req.route.path rather than req.path, and tests show an ID-bearing request path maps to a parameterized route. | Dynamic path/query/request IDs are not intentionally used as labels; unmatched values collapse to `unmatched`. | Preserve the invariant that only router-registered templates reach metrics/logs; add a test for a route value containing a concrete identifier and verify it collapses or is normalized. |
| Medium | Completion metrics/logs attach to the response `finish` event. Aborted clients or requests that never finish may not increment counters or record latency, masking a class of failures. | Finished responses record status and latency; ServiceDown is a separate signal. | Also observe aborted/closed responses with a bounded outcome label and measure in-flight requests/timeouts. No live disconnect test was run. |
| Low | Alert runbook_url values point to repository-relative Markdown paths, not deployed HTTP(S) documents. Alert viewers may not make them actionable. | Each alert has a runbook reference and human-readable annotations. | Publish stable runbook URLs in the alerting environment and validate links from the responder's interface. |
| Low | YAML parsing validates YAML syntax, not PromQL, labels, rule compatibility, or alert timing. | js-yaml successfully parsed the file and returned all expected alert names. | Add promtool rule validation and a rule test using representative series before rollout. |

## Diagnosis and safe conclusions

Most core guardrails exist: request IDs reject malformed control-character input and are echoed; metrics use route templates and a hard cap; DB query failures do not print connection details; startup validation is fail-fast; and generic production errors omit stacks. The most consequential remaining risks are the unauthenticated scrape surface, incomplete pattern-only redaction, metric overflow being labeled as status 500, and alert gaps when series/targets disappear. These are source-grounded risks, not evidence of an observed production incident.

## Verification evidence

All checks below were rerun for BREAK. Commands ran from D:/KNACK SEKHAR LAB/upsk-system-design-workspace/api.

### Startup failure-first drills

The compiled entry point was run from a fresh temporary current directory with synthetic environment values; no workspace .env supplied values, and the synthetic credential/URL values were not printed.

```text
=== missing DATABASE_URL ===
{"timestamp":"2026-11-23T09:54:44.536Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
exit=1
=== invalid NODE_ENV=prod ===
{"timestamp":"2026-11-23T09:54:47.826Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
exit=1
=== production redaction on startup failure ===
{"timestamp":"2026-11-23T09:54:51.087Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
exit=1
```

### Lint and build

Command: & 'C:\Program Files\nodejs\npm.cmd' run lint — exit 0.

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

Command: node ./node_modules/@nestjs/cli/bin/nest.js build — exit 0; no stdout or stderr.

### Jest

Config/exception command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand
```text
(node:26748) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        15.657 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```
Exit code: 0.

Team command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
```text
(node:25036) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        15.126 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```
Exit code: 0.

Requested observability command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts --runInBand
```text
(node:28300) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 4 passed, 4 total
Tests:       8 passed, 8 total
Snapshots:   0 total
Time:        11.807 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts.
```
Exit code: 0.

Controller command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.controller.spec.ts --runInBand
```text
(node:13724) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        2.977 s
Ran all test suites matching src/metrics/metrics.controller.spec.ts.
```
Exit code: 0. Total: 9 suites, 46 tests passed in the four invocations; the VM Modules warning was emitted.

### Alert parse and whitespace

Alert parse command: node -e "const fs=require('fs');const doc=require('js-yaml').load(fs.readFileSync('monitoring/alerts.yml','utf8'));console.log(JSON.stringify({groups:doc.groups.length,alerts:doc.groups[0].rules.map(x=>x.alert)}))"
```text
{"groups":1,"alerts":["HighErrorRate","HighLatency","ServiceDown"]}
```
Exit code: 0.

git diff --check — exit 0. Exact warnings:
```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', LF will be replaced by CRLF the next time Git touches it
```
No whitespace errors; warnings concern line-ending normalization.

### Docker and PostgreSQL/live HTTP

docker info — exit 1. Client version 29.9.2, context desktop-linux. Exact server error:
```text
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```
Docker build/run/health checks are NOT EXECUTED.

Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet — PowerShell command exit 0, result:
```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```
Live PostgreSQL-backed checks, HTTP requests, and Prometheus scrapes are NOT EXECUTED.

### UPSK status

Read-only upsk status --json at the start of this step returned:
```text
{"timestamp_unix_ms":1795427607402,"level":"error","message":"command.failed","context":{"command":"status"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

### UPSK reachability and advancement attempt — observed 2026-11-23 09:58:31 UTC

The first read-only HTTPS health probe failed with `No such host is known. (api.upsk.to:443)`. The one retry using the previously approved outbound network access succeeded:

```text
HTTP=200
{"ok":true,"version":"v1"}
```

After that probe, read-only `upsk status --json` still failed:

```text
{"timestamp_unix_ms":1795427895477,"level":"error","message":"command.failed","context":{"command":"status"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

The single requested advancement attempt used summary “Completed Production Readiness Module 04 BREAK: audited observability risks in metrics cardinality, alerts, metrics exposure, request correlation, stale gauges, and redaction; reran startup drills, tests, build, lint, and environment checks.” and evidence `progress/production-readiness/module-04/observability-break-analysis.md`. It failed:

```text
{"timestamp_unix_ms":1795427902981,"level":"error","message":"command.failed","context":{"command":"next"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

CLI version output: `upsk 0.1.30`. `last_error.json` is stale and still reports a prior `report` payload-read error for `progress\ai-augmented-engineering\module-05\module-05-report.json` (captured Unix time `1795362142645`; null status, code, correlation ID, request ID, error ID, and traceparent). It does not describe this status/next attempt. No official Module 04 checkpoint advance or score was returned. No code or dependency changes are part of this BREAK analysis.
