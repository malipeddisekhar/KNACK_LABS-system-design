# Production Readiness — Module 04 STEP 6: FIX and Verification

## Fixes applied

### Metrics overflow no longer looks like an HTTP failure

MetricsService now keeps real HTTP status labels as strings (for example, 200 or 500), uses status="unknown" for invalid status input, and folds over-capacity series into OTHER/other/overflow. Overflow requests increment the separate, unlabeled http_requests_overflow_total counter. A real 500 remains status="500"; the overflow bucket is not matched by the 5xx alert selector, so overflow cannot inflate 5xx math. It can, however, hide the original status/route of overflowed requests and undercount 5xx until label capacity is restored; the overflow alert makes this loss visible. The series cap remains 500. The updated test creates 600 unique route labels and verifies the cap, overflow status, absence of an overflow 500, and an overflow count of 101.

### Alert query scoping and detection

HighErrorRate now scopes numerator and denominator to job="url-shortener-api". HighLatency calculates p95 per job/method/path and includes the affected route in the alert summary. ServiceDown remains for a present target with up=0. Added ServiceTargetMissing using absent(up{job="url-shortener-api"}) to detect removed/mistagged targets, and MetricLabelOverflow to warn when overflow requests occur. Rule YAML parses, but promtool is not installed, so PromQL execution/rule tests were NOT EXECUTED.

### Redaction and request-ID edge tests

Logger and client-error redaction now also recognizes standalone email addresses and JWT-like three-segment values. Existing handling still flattens CR/LF in log messages, omits non-string log payloads, genericizes unexpected/5xx responses, and preserves ordinary validation messages. Added tests cover the new PII/JWT patterns and log-line flattening. Request-ID tests now cover absent and overlong headers as well as the existing malformed-header case. These are pattern-based protections, not a guarantee against every possible secret or encoded value.

## BREAK findings: addressed vs. remaining

| Finding | Fix/status | Remaining gate or limitation |
|---|---|---|
| Synthetic 500 on series overflow distorted error rate | Addressed: overflow label plus separate counter; regression-tested with 600 series. | Overflow cannot inflate 5xx, but loses original per-route/per-status detail and may undercount 5xx; MetricLabelOverflow warns when it occurs. |
| Cross-job error aggregation | Addressed: HighErrorRate filters job=url-shortener-api in numerator and denominator. | Validate the actual scrape job label in deployment. |
| Global latency p95 hid slow routes | Addressed: HighLatency groups by job, method, and path and names route in summary. | Tune thresholds against SLO and production scrape data. |
| Missing scrape target had no alert | Addressed: added ServiceTargetMissing. | A Prometheus server outage still needs an independent dead-man's switch/synthetic monitor. |
| Error-detail redaction did not cover standalone PII/JWT-like strings | Addressed for common email/JWT patterns; tests added. | Pattern matching is not complete; prefer allowlisted structured diagnostic fields and continue adversarial review. |
| Missing/oversized request-ID cases | Addressed by tests for absent and 129-character IDs. | A caller may reuse a syntactically valid ID; edge infrastructure should strip or replace untrusted inbound IDs. |
| Public /metrics scrape surface | No app guard added. | Deployment MUST restrict it through ingress/network policy to the Prometheus scrape network; live exposure check is NOT EXECUTED. |
| Stale team-count gauge/DB detail leakage | Existing 15s cache, availability gauge, caught query errors, and no DB error rendering remain. | Consumers must honor availability/freshness; query latency/timeout and live DB behavior are NOT EXECUTED. |
| Alert noise/delay and route-local blind spots | HighErrorRate is service-scoped; HighLatency is route-aware; sustained windows remain. | Clamp/5m rate and `for` durations trade speed for noise reduction; validate alert timing and low-traffic behavior with representative traffic. |
| Relative runbook links and rule validation | Rule annotations retained. | Repository-relative links are not necessarily actionable in Alertmanager; publish deployed HTTPS runbooks. promtool is not installed. |
| Aborted or never-finishing requests are missing from finish-based measurements | Not changed in this scoped fix. | Add bounded aborted/in-flight/timeout telemetry and test disconnect behavior. |

## Verification outputs

Commands ran from D:/KNACK SEKHAR LAB/upsk-system-design-workspace/api. No dependencies, package.json, or prisma/ changes were made in this FIX pass.

### Startup failure-first drills

Built dist/main.js was invoked from a fresh temporary working directory with synthetic environment values; the workspace .env could not provide values. Synthetic credentials/URLs were not printed.

```text
=== missing DATABASE_URL ===
{"timestamp":"2026-11-23T10:04:37.830Z","level":"error","message":"Startup configuration error: DATABASE_URL is required.","service_name":"url-shortener-api","request_id":null}
exit=1
=== invalid NODE_ENV=prod ===
{"timestamp":"2026-11-23T10:04:42.858Z","level":"error","message":"Startup configuration error: NODE_ENV must be one of development, staging, production, or test.","service_name":"url-shortener-api","request_id":null}
exit=1
=== production redaction on startup failure ===
{"timestamp":"2026-11-23T10:04:47.388Z","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
exit=1
```

### Lint

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

Six existing warnings, no lint errors.

### Nest build

Command: node ./node_modules/@nestjs/cli/bin/nest.js build — exit 0; no stdout or stderr.

### Jest suites

App/config command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand
```text
(node:14584) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       16 passed, 16 total
Snapshots:   0 total
Time:        20.17 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```
Exit code: 0.

Team command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand
```text
(node:17656) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        18.924 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```
Exit code: 0.

Observability command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts --runInBand
```text
(node:248) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 4 passed, 4 total
Tests:       12 passed, 12 total
Snapshots:   0 total
Time:        14.903 s
Ran all test suites matching src/metrics/metrics.service.spec.ts|src/metrics/http-metrics.middleware.spec.ts|src/common/app-logger.service.spec.ts|src/request-id.middleware.spec.ts.
```
Exit code: 0.

Controller command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/metrics/metrics.controller.spec.ts --runInBand
```text
(node:25316) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
Snapshots:   0 total
Time:        4.092 s
Ran all test suites matching src/metrics/metrics.controller.spec.ts.
```
Exit code: 0. Total across 4 invocations: 9 suites and 51 tests passed.

### Alert YAML and PromQL validator availability

YAML parse command: node -e "const fs=require('fs');const doc=require('js-yaml').load(fs.readFileSync('monitoring/alerts.yml','utf8'));console.log(JSON.stringify({groups:doc.groups.length,alerts:doc.groups[0].rules.map(x=>x.alert)}))"
```text
{"groups":1,"alerts":["HighErrorRate","HighLatency","ServiceDown","ServiceTargetMissing","MetricLabelOverflow"]}
```
Exit code: 0.

Prometheus rule validator availability check: Get-Command promtool — output `PROMTOOL=NOT_INSTALLED`; PromQL rule validation NOT EXECUTED (no package installed).

### Whitespace

git diff --check — exit 0; no whitespace errors. Git emitted only these line-ending normalization warnings:
```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', LF will be replaced by CRLF the next time Git touches it
```

### Docker and PostgreSQL/live HTTP/scrape

docker info exited 1. Docker client 29.9.2 / desktop-linux; exact server error:
```text
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```
Docker build/run/health checks are NOT EXECUTED.

Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet returned:
```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```
Live PostgreSQL, HTTP requests, and Prometheus scrape checks are NOT EXECUTED.

## Remaining rollout gates

1. Restrict /metrics at ingress/network policy to the Prometheus scrape path; then verify exposure from inside and outside that network.
2. Configure the url-shortener-api scrape job, alert receiver, and a separate dead-man's-switch monitor for Prometheus/Alertmanager outages.
3. Publish stable HTTPS runbook URLs in alert annotations and verify links in the responder UI.
4. Run promtool rule checks and rule tests when Prometheus tooling is available; YAML parse alone does not validate PromQL.
5. Execute Docker build/run/health checks and live PostgreSQL-backed HTTP/scrape tests when Docker Engine and the url_shortener_test database are reachable.
6. Evaluate alert thresholds, clamp behavior, route p95, aborted-request visibility, DB query bound, and overflow behavior against staging traffic.

## UPSK checkpoint

### UPSK reachability and advancement attempt — observed 2026-11-23 10:08:34 UTC

The first read-only HTTPS health probe failed with `No such host is known. (api.upsk.to:443)`. The single retry using previously approved outbound access succeeded:

```text
HTTP=200
{"ok":true,"version":"v1"}
```

After the health retry, `upsk status --json` failed:

```text
{"timestamp_unix_ms":1795428499583,"level":"error","message":"command.failed","context":{"command":"status"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

The single requested `upsk next` used summary “Completed Production Readiness Module 04 FIX: separated metric-cap overflow from HTTP 5xx, scoped and made latency alerts route-aware, added missing-target/overflow alerts, and expanded redaction/request-ID edge tests; recorded verification and deployment gates.” and evidence `progress/production-readiness/module-04/observability-fix-and-verification.md`. It failed:

```text
{"timestamp_unix_ms":1795428506987,"level":"error","message":"command.failed","context":{"command":"next"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

CLI version is `upsk 0.1.30`. The local `last_error.json` is stale: it still records command `report`, message `Could not read report payload file progress\ai-augmented-engineering\module-05\module-05-report.json`, status/code/correlation_id/request_id/error_id/traceparent all null, API host `api.upsk.to`, CLI version `0.1.30`, and captured Unix time `1795362142645`. It does not describe this Module 04 FIX attempt. No score or checkpoint transition was returned.
