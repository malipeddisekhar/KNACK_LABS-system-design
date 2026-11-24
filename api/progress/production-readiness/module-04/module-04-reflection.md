# Production Readiness — Module 04 REFLECT

## Decision callback: JSON-always logs and pull metrics

I would keep the Module 04 decisions: JSON lines in every environment make records consistently parseable and easy to correlate, while a Prometheus pull endpoint lets monitoring collect bounded service metrics without adding a push agent or dependency. Request IDs connect request-completion/error events across logs; counters and histograms show aggregate rates and latency; gauges show current process/team state. The decisions only work well when labels stay bounded, sensitive diagnostic details are withheld, and alert rules describe the service and routes responders need to act on.

## What the implementation taught me

The first observability pass had a subtle correctness bug: when the metric series cap was hit, new requests were assigned a synthetic HTTP 500 label. A cap intended to protect memory could therefore inflate the service's 5xx alert. The FIX changed overflow to a non-HTTP status label, added a separate overflow counter, and added a regression test that drives 600 unique series. This avoids false 5xx inflation, but overflow still loses the original status and route, so it can undercount errors; the overflow alert makes that loss visible.

The BREAK review also found that an unscoped error-rate expression could mix jobs and a global latency percentile could hide a slow route behind fast traffic. The FIX scoped alert queries to url-shortener-api, made latency p95 route-aware, and added detection for an absent scrape target and metric-label overflow. Pattern-based redaction was extended to common standalone email and JWT-like values, with tests for those edge cases, line breaks, and missing/overlong request IDs.

## Evaluation self-assessment

Prompt Quality — 5/5: the selected JSON-always and pull-Prometheus contracts were carried into concrete request-ID, content-type, label, and alert behavior. Review Thoroughness — 5/5: the work examined log/error leakage, labels, cap behavior, alert expressions, freshness, and unreachable infrastructure; the cap-to-500 defect was corrected with a targeted regression test. Iteration Efficiency — 5/5: the FIX targeted the highest-value BREAK findings and preserved unrelated code and dependencies. Judgment — 5/5: source and mocked-test evidence is distinguished from live Docker, PostgreSQL, HTTP, Prometheus, and rule-engine verification. Final Quality — 5/5: the changes build, focused suites pass, the alerts parse as YAML, and residual rollout gates are listed.

## Comprehension questions

1. What does each observability layer tell an on-call engineer? Structured logs provide request-level context and correlation; metrics summarize rates, latency, and current gauges; alert rules turn sustained thresholds into a notification.
2. Why keep metric labels bounded and semantically accurate? Unbounded labels consume memory and overload Prometheus; invented values such as status 500 corrupt error-rate math. Route templates and the explicit overflow counter bound the data while exposing lost detail.
3. What does the local proof establish, and what does it not establish? Build, unit tests, YAML parsing, and startup drills establish local behavior for the exercised cases. They do not establish that Docker runs, PostgreSQL queries succeed, Prometheus scrapes the endpoint, or deployed PromQL and alert delivery behave correctly.

## Mini-practical proof

The metrics unit suite passes 4/4 suites and 12/12 tests. Its cap test submits 600 distinct route series, confirms no more than 500 HTTP series, checks the overflow label is not status 500, and checks the separate overflow counter. The controller suite verifies the Prometheus content type. The alert YAML parser reports one group with HighErrorRate, HighLatency, ServiceDown, ServiceTargetMissing, and MetricLabelOverflow.

Risk: traffic exceeding the registry cap can still hide the original route/status and undercount 5xx. Mitigation: monitor http_requests_overflow_total, alert on any increase, preserve the non-5xx overflow label, and review route-series growth before rollout.

## Verification boundary and next actions

Startup drills failed fast for missing DATABASE_URL and NODE_ENV=prod, and production startup output was redacted. Lint and Nest build exited 0; all four requested Jest invocations passed 9 suites/51 tests; alert YAML parsed; git diff --check exited 0 with line-ending warnings. Six existing lint warnings remain in the team contract spec.

Docker Engine access was denied at its named pipe, so Docker build/run/health checks are NOT EXECUTED. PostgreSQL at 127.0.0.1:5432 returned False, so live PostgreSQL, HTTP, and scrape checks are NOT EXECUTED. promtool is not installed, so PromQL validation is NOT EXECUTED. The next operational step is to restrict /metrics to the scrape network, configure the scrape job/receiver and external dead-man's-switch, publish stable HTTPS runbooks, then run promtool and staging/live checks when the required infrastructure is available.

UPSK status and the report/next CLI path could not reach the API in this environment; no official REFLECT score or checkpoint transition is claimed until a successful CLI response is returned.


## Reproducible verification transcript

All commands below ran from D:/KNACK SEKHAR LAB/upsk-system-design-workspace/api. The startup test values were synthetic, and none were printed as output.

### Startup fail-fast drills

```text
=== missing DATABASE_URL ===
{"timestamp":"2026-11-23T10:15:10.450Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
exit=1
=== invalid NODE_ENV=prod ===
{"timestamp":"2026-11-23T10:15:13.564Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
exit=1
=== production redaction on startup failure ===
{"timestamp":"2026-11-23T10:15:16.705Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
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

App/config command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand
```text
(node:26864) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        5.224 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```
Exit code: 0.

Team command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
```text
(node:9968) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        5.135 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```
Exit code: 0.

Observability command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts --runInBand
```text
(node:28664) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 4 passed, 4 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        3.951 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts.
```
Exit code: 0.

Metrics controller command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.controller.spec.ts --runInBand
```text
(node:3884) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        1.97 s
Ran all test suites matching src/metrics/metrics.controller.spec.ts.
```
Exit code: 0. The four runs totaled 9 suites and 51 tests passed.

### Alert YAML, promtool, and diff check

YAML parse output:
```text
{"groups":1,"alerts":["HighErrorRate","HighLatency","ServiceDown","ServiceTargetMissing","MetricLabelOverflow"]}
```
Exit code: 0.

Promtool check: PROMTOOL=NOT_INSTALLED; promtool rule validation NOT EXECUTED.

git diff --check — exit 0:
```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', LF will be replaced by CRLF the next time Git touches it
```
No whitespace errors; only line-ending normalization warnings.

### Docker and PostgreSQL

docker info exited 1; Docker build/run/health checks are NOT EXECUTED. Exact server error:
```text
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet:
```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```
Live PostgreSQL, HTTP, and scrape checks are NOT EXECUTED.

### UPSK submission

upsk --version returned upsk 0.1.30. HTTPS health first failed with `No such host is known. (api.upsk.to:443)`; the approved retry returned `HTTP=200` and `{"ok":true,"version":"v1"}`. The first status output was `{"timestamp_unix_ms":1795428815785,"level":"error","message":"command.failed","context":{"command":"status"}}`; the post-health status output was `{"timestamp_unix_ms":1795428841381,"level":"error","message":"command.failed","context":{"command":"status"}}`. Both returned `Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"`.

The report submission returned:
```text
Warning: local session state was not saved.
Run: upsk sync
{"timestamp_unix_ms":1795429038621,"level":"error","message":"command.failed","context":{"command":"report"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

Following the CLI suggestion, one upsk sync --json attempt returned:
```text
{"timestamp_unix_ms":1795429064179,"level":"error","message":"command.failed","context":{"command":"sync"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

The local last_error.json remains stale: it records an earlier Module 05 report payload-read error for progress/ai-augmented-engineering/module-05/module-05-report.json, captured Unix time 1795362142645, with null status/code/correlation/request/error IDs. It does not describe the current Module 04 REFLECT attempt. The REFLECT report remains saved locally and contains no nonce. It was not accepted, so no next command was run and no official score/checkpoint is claimed.
