# Production Readiness — Module 07 Runbooks

## Operating boundaries

Commands below are copy-pasteable PowerShell 5.1 commands for the local lab ports (`API 3000`, `PostgreSQL 5432`, `Redis 6379`) and local Docker container name established by the service overview. The repository has CI build/publish configuration but no production deployment host or deployment job. Do not infer production health from a local probe. Never print `.env`, `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, tokens, or full exception objects. The current test database guard requires `TEST_DATABASE_URL` to target exactly `url_shortener_test`.

Severity / routing: post the incident and impact in `#url-shortener-oncall` at detection; page secondary on-call at 10 minutes; issue a state update/escalation check by 15 minutes if unresolved; page the engineering manager at 20 minutes if impact persists or grows.

## Runbook 1 — Database connection failure / pool exhaustion

### Detection

Use `DatabaseConnectionFailure` as the incident label for connection refusal/DNS/credential failures and `DatabasePoolExhaustion` for connection-acquire waits or saturation. The `/ready` endpoint should report `503` with `checks.database: down` when the API is running and its DB check fails. `/health` is liveness only and can remain `200`. Alert on `HighErrorRate`, `HighLatency`, or `ServiceDown` if their conditions are met; correlate API JSON logs using `request_id` and `dependency_timeout` records.

### Diagnosis checklist

1. Check the local PostgreSQL TCP port:

   ```powershell
   Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
   ```

   Healthy expected output: `True`. Failure expected output: warning that TCP connect to `127.0.0.1:5432` failed, then `False`.

2. Check process liveness:

   ```powershell
   curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/health
   ```

   Healthy expected output includes `HTTP/1.1 200 OK` and `{"ok":true}`. If API is stopped/unreachable, curl reports connection failure and exits nonzero. A `200` is not a database health signal.

3. Check dependency readiness:

   ```powershell
   curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/ready
   ```

   Healthy expected body: `{"status":"ready","checks":{"database":"up","redis":"up"}}` with HTTP `200`. A live API with a DB failure should return HTTP `503`, `status: not_ready`, and `checks.database: down`; messages are sanitized. If the API itself is not listening, curl fails without an HTTP status.

4. If the API is running, inspect DB sessions through a read-only query. This uses the API directory `.env` without printing the connection URL; it emits only state/wait counts or a sanitized driver error code:

   ```powershell
   node --input-type=module -e 'import "dotenv/config"; import pg from "pg"; const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 2000, query_timeout: 2000 }); try { await client.connect(); const result = await client.query("SELECT state, wait_event_type, count(*)::int AS sessions FROM pg_stat_activity WHERE datname = current_database() GROUP BY state, wait_event_type ORDER BY state, wait_event_type"); console.log(JSON.stringify(result.rows)); } catch (error) { console.error(JSON.stringify({ error: error.code ?? "DATABASE_CHECK_FAILED" })); process.exitCode = 1; } finally { await client.end().catch(() => {}); }'
   ```

   Healthy expected output is JSON rows with session states/counts and exit 0. On refusal, expected output is a JSON error code such as `ECONNREFUSED` and nonzero exit; no connection URL is emitted. The configured `max: 10` is per Prisma client pool; total `pg_stat_activity` sessions can include the worker and other services, so do not infer pool exhaustion from the aggregate count alone. Run only in the trusted API workspace with its intended environment.

5. Confirm the Docker engine is available before attempting a container action:

   ```powershell
   docker info
   ```

   Healthy output contains both Client and Server information. If the Docker named pipe is missing, do not issue container start/restart commands; use the infrastructure escalation path.

### Fix checklist

1. If `Test-NetConnection` is `False`, check the configured local lab service without dumping config:

   ```powershell
   Get-Service | Where-Object { $_.Name -like 'postgresql*' -or $_.DisplayName -like '*PostgreSQL*' } | Select-Object Name,Status
   ```

   Expected output is the installed service name and status, or no rows if PostgreSQL is not a Windows service. If Docker is the configured owner, use the published-port lookup below only after `docker info` succeeds.

2. Start a stopped Windows PostgreSQL service only when exactly one matching service is present:

   ```powershell
   $pgServices = @(Get-Service | Where-Object { $_.Name -like 'postgresql*' -or $_.DisplayName -like '*PostgreSQL*' })
   if ($pgServices.Count -ne 1) { throw "Expected exactly one PostgreSQL Windows service; found $($pgServices.Count). Do not guess; escalate." }
   if ($pgServices[0].Status -ne 'Running') { Start-Service -InputObject $pgServices[0] }
   Get-Service -Name $pgServices[0].Name | Select-Object Name,Status
   ```

   Expected healthy output: one PostgreSQL service with `Status` `Running`. Access denied or multiple/no services: stop and page the database/platform owner; do not change credentials or ports.

3. For a Docker-hosted local database, require exactly one container publishing port 5432 and start it only if stopped:

   ```powershell
   $pgContainers = @(docker ps -aq --filter 'publish=5432')
   if ($LASTEXITCODE -ne 0) { throw 'Docker engine unavailable; do not retry container commands. Escalate.' }
   if ($pgContainers.Count -ne 1) { throw "Expected exactly one container publishing port 5432; found $($pgContainers.Count). Do not guess; escalate." }
   $pgState = docker inspect --format '{{.State.Status}}' $pgContainers[0]
   if ($LASTEXITCODE -ne 0) { throw 'Could not inspect the PostgreSQL container; escalate.' }
   if ($pgState -eq 'exited') { docker start $pgContainers[0] }
   if ($LASTEXITCODE -ne 0) { throw 'PostgreSQL container start failed; escalate to the platform owner.' }
   docker inspect --format '{{.State.Status}}' $pgContainers[0]
   ```

   Expected output after a successful start: `running`; if already healthy, it remains `running`. This path is local-only and must not be used against an unidentified production container.

4. Repeat TCP reachability twice with a 2-minute interval:

   ```powershell
   1..2 | ForEach-Object { $sample = $_; Write-Output "TCP sample $sample"; Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet; if ($sample -eq 1) { Start-Sleep -Seconds 120 } }
   ```

   Healthy expected outputs: `True` for both samples. If either remains `False`, keep the incident open. Do not change pool size, credentials, or schema during an incident without the database owner.

### Verification and escalation

At the 2-minute check, healthy expected outputs are TCP `True` and `/ready` HTTP `200` with both checks `up`; compare DB sessions with known API/worker pool budgets instead of treating the per-process pool maximum as a global limit. If any check remains failed, keep the incident open, preserve sanitized logs, page secondary at 10 minutes, escalate/update by 15 minutes, and notify the manager at 20 minutes. A live failed command is not proof of a production outage.

## Runbook 2 — High error rate / 5xx spike

### Detection

Prometheus rule `HighErrorRate` fires when the API's 5xx rate exceeds 5% over a 5-minute rate window for 5 minutes. The expression is scoped to `job="url-shortener-api"`. The `ServiceDown`/`ServiceTargetMissing` alerts cover failed or absent API scrape targets, not a Prometheus server outage.

### Diagnosis checklist

1. Check whether the API process responds:

   ```powershell
   curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/health
   ```

   Healthy expected output: HTTP `200`, `{"ok":true}`. Problem: no HTTP response or non-200.

2. Check dependency readiness:

   ```powershell
   curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/ready
   ```

   Healthy expected output: HTTP `200`, both `database` and `redis` `up`. Dependency problem: HTTP `503` and one or more checks `down`.

3. Read bounded route/status counters and overflow signal:

   ```powershell
   curl.exe --silent --show-error --max-time 3 http://127.0.0.1:3000/metrics | Select-String '^http_requests_total|^http_requests_overflow_total'
   ```

   Healthy expected output: metrics text with bounded method/path/status series and an overflow counter; a 5xx incident shows a rising series with `status="5xx-value"` (for example `status="500"`). No metrics response is a scrape/API reachability issue. The overflow bucket uses `status="overflow"`, not a synthetic 500.

4. Inspect only allowlisted, sanitized application diagnostics:

   ```powershell
   docker logs --since 15m --tail 200 url-shortener-api 2>&1 | Select-String 'http_request_completed|dependency_timeout|dependency_circuit_state_changed|dependency_operation_failed_details_withheld'
   ```

   Healthy expected output: request completion records with status below 500 and no repeated dependency timeout/circuit-open warnings. Problem output: correlated 5xx statuses or repeated dependency timeout/state-change events. Never replace this with a command that dumps `.env` or raw exceptions.

### Fix checklist

1. If `/ready` reports a dependency down, follow Runbook 1 for PostgreSQL or the Redis fallback boundary in the service overview; critical writes remain fail-closed. Expected result: the dependency probe returns healthy or its sanitized not-ready state remains visible; do not mark resolved from a passing liveness probe alone.
2. If logs point to a new release and an approved previous image exists, use the service overview's local rollback commands; first verify the target is the local `url-shortener-api` container. Expected result: rollback command prints `{"ok":true}` and `/ready` returns HTTP `200`; a failed check keeps the incident open. Do not roll back a database schema blindly.
3. If no dependency or release cause is confirmed, keep the incident open and page the on-call owner. Expected result: no unverified service change is made, and the on-call channel acknowledges ownership. Do not mask 5xx responses, disable authorization, or retry permanent errors to lower the alert.

### Verification and escalation

Run this exact two-sample check and compare the metric output:

```powershell
1..2 | ForEach-Object { $sample = $_; Write-Output "Error-rate sample $sample"; curl.exe --silent --show-error --max-time 3 http://127.0.0.1:3000/metrics | Select-String '^http_requests_total|^http_requests_overflow_total'; if ($sample -eq 1) { Start-Sleep -Seconds 120 } }
```

Healthy expected outputs are health `200`, readiness `200` with all required checks up, and no continuing increase in 5xx rate; no `status="5.."` series/increase is expected when no 5xx requests occurred. If 5xx remains above threshold at 15 minutes, escalate in `#url-shortener-oncall`; secondary is paged at 10 minutes and the engineering manager at 20 minutes.

## Runbook 3 — High latency / slow responses

### Detection

Prometheus rule `HighLatency` fires when route-aware five-minute p95 HTTP duration exceeds 500 ms for 10 minutes. Alert labels include job, method, and route template; arbitrary IDs are not metric labels. Database statement/query bounds are 3,000/3,500 ms; readiness checks have a 2,000 ms application timeout. A `Promise.race` timeout does not cancel the underlying driver operation.

### Diagnosis checklist

1. Measure liveness response duration without following redirects:

   ```powershell
   curl.exe --silent --show-error --output NUL --write-out "status=%{http_code} total=%{time_total}s`n" --max-time 3 http://127.0.0.1:3000/health
   ```

   Healthy expected output is `status=200` with a small duration. Problem output is a duration near the 3-second client cap or curl timeout/nonzero exit. This samples liveness only; it is not a business-route latency guarantee.

2. Compare dependency readiness:

   ```powershell
   curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/ready
   ```

   Healthy expected output is HTTP `200` with database and Redis up. Problem output is HTTP `503`, a client timeout, or no listener.

3. Inspect request duration metrics:

   ```powershell
   curl.exe --silent --show-error --max-time 3 http://127.0.0.1:3000/metrics | Select-String '^http_request_duration_seconds_(sum|count)|^http_request_duration_seconds_bucket|^process_(resident_memory|heap_used|uptime)'
   ```

   Healthy output contains histogram buckets/counts and process gauges. Problem output shows growing duration sums, upper buckets, or memory/uptime changes; Prometheus p95 rule remains the route-level signal.

4. Check container resource use and correlated dependency events:

   ```powershell
   docker stats --no-stream url-shortener-api
   docker logs --since 15m --tail 200 url-shortener-api 2>&1 | Select-String 'dependency_timeout|dependency_circuit_state_changed|http_request_completed'
   ```

   Healthy expected output shows stable CPU/memory and no repeated timeouts. High CPU/memory or repeated PostgreSQL/Redis timeout records suggests saturation; Docker stats failure means the local Docker engine is not available, not that production is healthy.

### Fix checklist

1. If readiness is degraded, follow the relevant dependency runbook; do not increase timeout budgets during the incident. Expected output after a verified dependency recovery is readiness HTTP `200`; otherwise it remains `503` and the incident remains open.
2. If process CPU/memory is saturated, record the resource output and escalate before restarting a production service. For the local Docker instance only, a deliberate restart is `docker restart url-shortener-api`; expected output is `url-shortener-api`, followed by health HTTP `200` and readiness HTTP `200`. Do not run this against an unknown production host or when Docker health is unavailable.
3. If latency follows a release, use the retained immutable previous image through the documented rollback procedure. Expected output is the previous image starts and the health/readiness checks pass; if either check fails, keep the incident open and escalate. Verify database compatibility before any rollback.

### Verification and escalation

Run this exact two-sample liveness/readiness check:

```powershell
1..2 | ForEach-Object { $sample = $_; Write-Output "Latency sample $sample"; curl.exe --silent --show-error --output NUL --write-out "status=%{http_code} total=%{time_total}s`n" --max-time 3 http://127.0.0.1:3000/health; curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/ready; if ($sample -eq 1) { Start-Sleep -Seconds 120 } }
```

Healthy expected results: health responds under 0.5 seconds in an individual local sample, readiness is HTTP `200`, and route-level p95 returns below the 500 ms alert threshold. If latency or impact remains at 15 minutes, escalate in `#url-shortener-oncall`; secondary page begins at 10 minutes, manager escalation at 20 minutes.

## Chunk 3 — Dry-run and local verification record

### Database connection failure dry-run

The dry-run used the observed local outage without stopping or changing any service. It exercised three diagnostic steps: TCP port probe, API liveness probe, and API readiness probe. It stopped before repair because the local Docker engine was unavailable and no service restart could be performed safely. This is a tested diagnostic walkthrough, not a successful recovery simulation; no live PostgreSQL/HTTP behavior is claimed.

```text
Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False

curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/health
curl: (7) Failed to connect to 127.0.0.1:3000 after 1 ms: Could not connect to server
HEALTH_CURL_EXIT=7

curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/ready
curl: (7) Failed to connect to 127.0.0.1:3000 after 1 ms: Could not connect to server
READY_CURL_EXIT=7

docker info
Server: failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
DOCKER_INFO_EXIT=1

docker ps --format "table {{.Names}}`t{{.Status}}"
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.
DOCKER_PS_EXIT=1
```

Dry-run conclusion: the checks correctly separated local API unavailability from PostgreSQL reachability and halted before an unsafe restart. No fix step completed because the control plane was inaccessible; the service remains unverified locally.

### Local verification outputs from the latest Module 06 pass

These are local results recorded in `module-06-reflection.md`; no source files changed during this documentation task.

```text
& 'C:\Program Files\nodejs\npm.cmd' run lint
> api@0.0.1 lint
> oxlint --type-aware src/ test/
6 typescript(unbound-method) warnings in src/teams/team-collaboration-contracts.spec.ts (116:17, 166:17, 217:17, 261:17, 277:71, 309:17)
LINT_EXIT=0

node ./node_modules/@nestjs/cli/bin/nest.js build
BUILD_EXIT=0

Jest group results (each command used --runInBand):
src/app.module.spec.ts src/common/http-exception.filter.spec.ts: 2 suites passed, 16 tests passed, exit 0
src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts: 2 suites passed, 22 tests passed, exit 0
src/metrics/metrics.service.spec.ts src/metrics/http-metrics.middleware.spec.ts src/common/app-logger.service.spec.ts src/request-id.middleware.spec.ts: 4 suites passed, 13 tests passed, exit 0
src/analytics/analytics.service.spec.ts src/ready.controller.spec.ts: 2 suites passed, 16 tests passed, exit 0
src/common/resilience.spec.ts src/common/bull-config.spec.ts src/cache/cache.service.spec.ts: 3 suites passed, 11 tests passed, exit 0
TOTAL: 13 suites passed, 78 tests passed

git diff --check
DIFF_CHECK_EXIT=0

docker info
DOCKER_INFO_EXIT=1 (Docker Desktop Linux engine named pipe not found; live Docker checks NOT EXECUTED)

Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False (live PostgreSQL and HTTP checks NOT EXECUTED)
```

## Runbook maintenance

Re-test the relevant runbook after every incident that uses it, after changes to ports, deployment topology, dependencies, alert rules, or timeout settings, and during a scheduled operational review. Update expected command output and escalation contacts when the deployed configuration changes; an untested runbook is not operational proof.
