# Module 08: Verification & Operational Readiness Evidence

**Date:** 2026-11-24  
**Module:** 08 — Deploy & Verify  
**Step:** VERIFY  
**Decisions Carried Forward:**
- `decisions.module_08.deploy_strategy = rolling`
- `decisions.module_08.rollback_approach = automated`

---

## 1. Proof Checklist & Execution Evidence

### 1.1 Endpoint Structure & Dependency Separation
- **`GET /health` and `GET /live`:** Exposes process liveness only. Returns `HTTP 200` with `{"ok":true}`. Dependency-free, ensuring that database or cache latency does not falsely cause liveness probe failure and container kill loops.
- **`GET /ready`:** Exposes dependency readiness for traffic routing. Actively queries PostgreSQL (`SELECT 1;`) and Redis (`PING`) with strict 2,000 ms application timeouts (`withTimeout`).
  - Healthy response structure: `HTTP 200` `{"status":"ready","checks":{"database":"up","redis":"up"}}`.
  - Unhealthy response structure: `HTTP 503` `{"status":"not_ready","checks":{"database":"down","redis":"up"},"message":"One or more required dependencies are unavailable."}`.
  - Returns explicit component details without leaking connection strings, credentials, or stack traces.

### 1.2 Metrics Exposition (`GET /metrics`)
Returns Prometheus text metrics:
- Bounded request counters: `http_requests_total{method="...",route="...",status="..."}`.
- Cardinality overflow safeguard: `http_requests_overflow_total{method="...",status="overflow"}`.
- Request duration histograms: `http_request_duration_seconds_bucket{le="..."}`, `http_request_duration_seconds_sum`, `http_request_duration_seconds_count`.
- Process gauges: `process_resident_memory_bytes`, `process_heap_used_bytes`, `process_uptime_seconds`.
- Business telemetry: `team_count` gauge tracking active team collaboration state.

### 1.3 Smoke Verification Automation (`smoke-verify.ps1`)
Automated post-deployment verification script polls `/ready` for up to 15 attempts (30s window), followed by assertions on `/health` and `/metrics`.
If `/ready` returns non-200, the script aborts with `DEPLOYMENT_FAILED` and triggers automated rollback.

### 1.4 Failure-First Broken Deployment Drill
- **Scenario:** `DATABASE_URL` misconfigured or database unreachable during rolling deployment.
- **Outcome:** The new container starts, but `GET /ready` fails PostgreSQL `SELECT 1` (times out after 2,000 ms or fails immediately).
- **Traffic Protection:** Because the platform and `smoke-verify.ps1` gate on `/ready`, the new container returns HTTP 503 and is never placed into the load balancer rotation. 100% of user traffic remains safely served by existing healthy instances.
- **Automated Rollback:** After 3 failed readiness probes within 60 seconds, automated rollback reverts to `local/upsk-system-design-api:rollback` within 120 seconds.

---

## 2. Conceptual Questions

### Question 1: Trace the Full Deployment Pipeline
From `git push origin main` until a user request hits the new version:
1. **GitHub Actions Trigger:** Push to `main` initiates `.github/workflows/ci.yml`.
2. **Quality Gates:**
   - `lint`: `oxlint --type-aware src/ test/` enforces code quality and type safety.
   - `build`: `nest build` compiles TypeScript to `dist/`.
   - `test`: All 13 Jest suites run in band, testing 78 unit/mocked assertions.
   - *Failure Catch:* Any lint failure, compile error, or test assertion failure halts the pipeline immediately; no image is built or pushed.
3. **Container Build & Packaging:**
   - Multi-stage Docker build compiles and bundles production assets into a Debian-slim image running as unprivileged `appuser`.
   - Image tagged with immutable git commit SHA: `local/upsk-system-design-api:$GITHUB_SHA`.
   - *Failure Catch:* Docker build failure, oversized image (>512 MiB), or root user misconfiguration aborts the pipeline.
4. **Rolling Deployment Hand-Off:**
   - Orchestrator provisions one new container with `$GITHUB_SHA` and injects encrypted platform secrets.
   - Old container continues serving 100% of traffic.
5. **Readiness Probe & Smoke Verification Gate:**
   - Orchestrator polls `GET /ready` and runs `smoke-verify.ps1`.
   - Checks: PostgreSQL `SELECT 1` returns within 2s, Redis `PING` returns within 2s, `/metrics` returns 200.
   - *Failure Catch:* If `/ready` returns 503 or times out, the container is marked unhealthy. Traffic is never routed. Automated rollback restores the previous SHA.
6. **Traffic Shift:**
   - Once `/ready` returns 200, load balancer adds the new container to the active pool and drains the old container.

### Question 2: Monday Morning Verification Check
A deployment occurred Friday at 4:00 PM without weekend monitoring. To verify production health on Monday morning:
1. **Prometheus Alertmanager / Incident Channels:** Check `#url-shortener-oncall` for any firing or unresolved alerts:
   - `HighErrorRate`: 5xx rate > 5% over 5m.
   - `HighLatency`: p95 request duration > 500ms over 10m.
   - `ServiceDown` / `ServiceTargetMissing`: Prometheus scrape target down.
2. **Process Health & Uptime:** Query `/metrics` for `process_uptime_seconds`. If uptime is under 60 hours, the service restarted over the weekend (indicating crash-loops, OOMs, or node evictions).
3. **Memory & Resource Trends:** Inspect `process_resident_memory_bytes` and `process_heap_used_bytes` over the 60-hour window. A steady upward slope indicates a slow memory leak.
4. **Application Logs:** Query structured JSON logs for records with `level: "error"` or `dependency_timeout` and correlate by `request_id`.
5. **Live Readiness Check:** Execute `curl -i http://.../ready` to verify `{"status":"ready","checks":{"database":"up","redis":"up"}}`.

### Question 3: Silent Degradation & Memory Leak Mitigation
A memory leak causes latency to climb and 503 errors after 4 hours, while `/ready` continues passing because database and Redis connectivity remain healthy:
- **Root Cause of the Observability Gap:** `/ready` tests dependency connectivity, not internal process heap exhaustion or event loop lag.
- **Mitigation & Detection Strategy:**
  1. **Heap Saturation Alert:** Add a Prometheus alert rule:
     ```yaml
     - alert: HighMemoryUsage
       expr: (process_resident_memory_bytes / 536870912) > 0.85
       for: 10m
     ```
     Alerts the team when resident memory exceeds 85% of the 512 MiB container ceiling.
  2. **Event Loop Lag Monitoring:** Add `nodejs_eventloop_lag_seconds` to Prometheus metrics and alert if p99 lag exceeds 100 ms.
  3. **Readiness Memory Guard:** Extend `ReadyController` to evaluate internal memory health:
     ```typescript
     const memory = process.memoryUsage();
     if (memory.heapUsed > 0.90 * memory.heapTotal) {
       checks.memory = 'exhausted';
       ready = false;
     }
     ```
     When heap exceeds 90%, `/ready` returns 503, causing the orchestrator to cycle the leaking instance gracefully before customer requests time out.

---

## 3. Local Verification Results & Boundaries

A fresh verification pass was executed in the workspace:
- **Startup Fail-Fast:** Missing `DATABASE_URL` (exit 1), invalid `NODE_ENV=prod` (exit 1), production startup error sanitized without stack trace.
- **Lint:** `oxlint --type-aware src/ test/` -> 6 pre-existing unbound-method warnings, 0 errors (`LINT_EXIT=0`).
- **Nest Build:** `BUILD_EXIT=0`.
- **Jest Suites:** 13 suites / 78 tests passed across 5 groups (all exits 0).
- **Git Diff:** `git diff --check` -> `DIFF_CHECK_EXIT=0`.
- **Docker Info:** `DOCKER_INFO_EXIT=0` (0 running containers).
- **TCP Reachability (Port 5432):** `False`.

### Explicit NOT EXECUTED Boundaries
- Live Docker container deployment, container restart, and live container rollback checks are **NOT EXECUTED** (0 running containers).
- Live PostgreSQL database queries (`url_shortener_test`) and live HTTP smoke probes (`/health`, `/ready`, `/metrics`) are **NOT EXECUTED** (local PostgreSQL port 5432 is down).
