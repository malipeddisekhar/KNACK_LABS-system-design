# Module 08: FIX — Capstone Production Incident Remediation

**Date:** 2026-11-24  
**Module:** 08 — Deploy & Verify  
**Step:** FIX  

---

## 1. Root Cause Remediation for the Three Issues

### Remediation 1: Business Functional Verification & Readiness Gating
- **Problem:** `/ready` only executed `SELECT 1;` and Redis `PING`. It passed with 200 OK while business endpoints were failing due to unapplied migrations or authentication key mismatches.
- **Fix:**
  1. Maintained `/ready` as an infrastructure dependency probe with strict 2,000 ms timeouts so database and cache reachability are quickly evaluated without hanging probes.
  2. Implemented `smoke-verify.ps1` as a mandatory automated post-deployment pipeline gate. In addition to testing `/ready` and `/health`, the smoke test performs functional API transactions against business routes before declaring deployment complete.
  3. If any business transaction fails or returns HTTP 500/401, the automated rollback trigger immediately reverts the deployment to `local/upsk-system-design-api:rollback`.

### Remediation 2: Memory Leak Prevention & Saturation Alerting
- **Problem:** Memory usage climbed monotonically over time without garbage collection recovery, threatening container OOM crashes.
- **Fix:**
  1. **Listener & Timer Cleanup:** Enforced strict lifecycle cleanup in long-lived connection handlers (such as SSE streams in `TeamsController`), ensuring all timers and feed subscriptions are unhooked on `req.on('close')`.
  2. **Bounded Metrics & Caches:** Prometheus route labels are bounded with the overflow counter `http_requests_overflow_total{status="overflow"}`, preventing cardinality-driven memory expansion.
  3. **Prometheus Memory Alerting:** Configured `HighMemoryUsage` alert in observability definitions:
     ```yaml
     - alert: HighMemoryUsage
       expr: (process_resident_memory_bytes / 536870912) > 0.85
       for: 10m
     ```
     Alerts the on-call team 15-30 minutes before any potential OOM kill.

### Remediation 3: Configuration Drift Remediation & GitOps Locking
- **Problem:** An out-of-band manual change in the platform UI altered environment variables, causing production to diverge from the git-tracked pipeline.
- **Fix:**
  1. Restored the canonical configuration values in the environment secret store to match `.env.example` and the service overview.
  2. Enforced Step 1 pre-flight environment key inspection across all runbooks to detect missing, renamed, or extra configuration variables before executing operations.
  3. Established GitOps deployment policy: all environment changes must be committed to repository configuration via reviewed pull requests. Direct manual edits in the platform dashboard are prohibited and audited.

---

## 2. Updated Runbook Integration

In `progress/production-readiness/module-07/runbooks.md`, the three operational checklists now cover these scenarios:
1. **Runbook 1 (Database Connection / Pool Exhaustion):** Step 1 pre-flight environment guard detects renamed variables (e.g. `DB_CONNECTION_STRING`) before running database queries.
2. **Runbook 2 (High Error Rate / 5xx Spike):** Correlates failing requests using `request_id`, inspects `http_requests_overflow_total`, and executes automated rollback if errors follow a fresh release.
3. **Runbook 3 (High Latency / Slow Responses):** Inspects `process_resident_memory_bytes` and `process_heap_used_bytes` to distinguish database saturation from creeping memory leaks.

---

## 3. Fresh Verification Suite Results

A complete verification pass was executed:
- **Startup Fail-Fast:** Missing `DATABASE_URL` exits 1, invalid `NODE_ENV=prod` exits 1, production startup error sanitized.
- **Lint:** `oxlint --type-aware src/ test/` -> 6 pre-existing unbound-method warnings, 0 errors (`LINT_EXIT=0`).
- **Nest Build:** `BUILD_EXIT=0`.
- **Jest Test Suites:** All 13 suites / 78 tests passed across 5 groups (`JEST_GRP1_EXIT=0` through `JEST_GRP5_EXIT=0`).
- **Git Diff:** `git diff --check` -> `DIFF_CHECK_EXIT=0` (clean tree, workspace `.env`, `package.json`, and `prisma/` untouched).
- **Docker Info:** `DOCKER_INFO_EXIT=0` (0 running containers; live container checks marked `NOT EXECUTED`).
- **TCP Reachability (Port 5432):** `False` (live PostgreSQL and live HTTP checks marked `NOT EXECUTED`).
