# Module 08: BREAK — Production Incident Diagnosis

**Date:** 2026-11-24  
**Module:** 08 — Deploy & Verify  
**Step:** BREAK  

---

## The Production Incident Symptoms

1. **Dashboard is Green, `/ready` returns HTTP 200, but real business endpoints are failing.**
2. **Process memory usage is steadily climbing over time instead of plateauing.**
3. **A production configuration value differs from the deployment pipeline specification (out-of-band drift).**

---

## Issue 1 Diagnosis: Shallow Readiness vs. Business Endpoint Failure

### Symptom Analysis
`/ready` reports:
```json
{"status":"ready","checks":{"database":"up","redis":"up"}}
```
Yet requests to business endpoints (`POST /links`, `GET /r/:code`, `POST /teams`) fail with 500 or 401 errors.

### Root Cause
`ReadyController` executes shallow connectivity checks:
`this.prisma.$queryRaw\`SELECT 1;\`` and `this.cacheService.ping()`.
A `SELECT 1;` confirms that the database server is running and the TCP connection was negotiated. It does **not** verify:
1. **Schema Migration Status:** If Prisma migrations (`prisma migrate deploy`) were not run during release, required database tables (`links`, `teams`, `users`) or new columns are missing. `SELECT 1` succeeds, but business queries fail with PostgreSQL error `42P01: relation does not exist`.
2. **Permission / Grants Drift:** The database role may have `CONNECT` privilege but lacks `SELECT` or `INSERT` privileges on business tables.
3. **Authentication / Secret Desynchronization:** If `JWT_SECRET` was altered or out-of-sync, authentication guards reject all API requests with `401 Unauthorized`, while `/ready` (which is public) continues returning 200.

### The Lesson
Readiness checks that only verify `SELECT 1` create false operational confidence. Post-deployment smoke tests must execute real, authenticated functional transactions against business endpoints before declaring a deployment ready for user traffic.

---

## Issue 2 Diagnosis: Process Heap Memory Leak

### Symptom Analysis
Metrics endpoint (`/metrics`) reveals that `process_resident_memory_bytes` and `process_heap_used_bytes` are monotonically increasing over time with no garbage collection plateau, heading toward the 512 MiB container ceiling.

### Root Cause
1. **Unbounded Event Listeners / Closures:** In streaming endpoints (such as SSE activity streams in `TeamsController`), event listeners registered on client connections without proper `req.on('close')` cleanup retain request objects in heap memory.
2. **Unpruned Trace / Logging Collections:** Request correlation structures, timer instances, or in-memory caches that lack strict eviction policies (TTL / LRU size limits) accumulate unbounded references.
3. **Why `/ready` Missed It:** `/ready` evaluates external network connectivity, not internal process heap exhaustion or memory growth velocity. By the time heap exhaustion triggers a crash, the container suffers out-of-memory (OOM) termination.

---

## Issue 3 Diagnosis: Out-of-Band Configuration Drift

### Symptom Analysis
A live production environment variable does not match the checked-in pipeline definition in `.github/workflows/ci.yml` or the configuration contract.

### Root Cause
1. **Manual Console Intervention:** An operator modified environment variables directly in the hosting platform's web dashboard or via platform CLI during an earlier triage event, bypassing git version control.
2. **Operational Hazard:**
   - Any future automated deployment from the pipeline will overwrite the manual change, re-introducing the original incident unexpectedly.
   - The repository no longer reflects production reality, violating the principle of infrastructure-as-code and making local troubleshooting unreliable.

---

## Summary of Diagnostic Findings

| Problem | Apparent Status | Underlying Root Cause | Verification Blindspot |
|---|---|---|---|
| Business Endpoint Failure | `/ready` = 200 (Green) | Database schema migration unapplied (`SELECT 1` passes but table queries fail) or `JWT_SECRET` mismatch | `/ready` only tests shallow socket connectivity, not functional schema or auth |
| Creeping Memory Leak | Container running | Event listener / request context retained in heap closures | `/ready` does not inspect heap memory saturation |
| Configuration Drift | App boots | Manual out-of-band platform UI modification outside GitOps pipeline | Pipeline lacks drift detection against live platform state |
