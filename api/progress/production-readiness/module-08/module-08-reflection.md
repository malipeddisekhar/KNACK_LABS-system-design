# Module 08 Reflection — Capstone: Deploy & Verify

**Date:** 2026-11-24  
**Module:** 08 — Deploy & Verify (Capstone)  
**Step:** REFLECT  
**All Skill Decisions:**
- `decisions.module_08.deploy_strategy = rolling`
- `decisions.module_08.rollback_approach = automated`
- `decisions.module_07.runbook_format = checklist`
- `decisions.module_06.circuit_breaker_approach = library`
- `decisions.module_06.timeout_strategy = aggressive`
- `decisions.module_05.failure_stance = fail_closed`
- `decisions.module_04.log_format = json_always`
- `decisions.module_04.metrics_approach = pull_prometheus`
- `decisions.module_03.secret_strategy = platform_env`
- `decisions.module_03.config_approach = env_overrides`
- `decisions.module_02.ci_platform = github_actions`
- `decisions.module_02.pipeline_shape = sequential`
- `decisions.module_01.base_image = debian_slim`
- `decisions.module_01.build_strategy = multi_stage`

---

## 1. Capstone Discussion & Decision Reflections

### 1. Deploy Strategy & Rollback Decisions (Closing the Module 08 Loop)
- **Choice Evaluated:** Option A (`rolling` deploy with `automated` rollback).
- **Reflection:** Rolling deploys eliminate 2x compute duplication and avoid exhausting PostgreSQL connection pools (maximum 10 per instance) for `url-shortener-api`. The tradeoff is that both old and new container versions run concurrently during rollout, requiring expand-and-contract Prisma migrations. Automated rollback removes human panic and latency during 3 AM incidents.
- **Rollback Drill Insight:** A rollback plan is worthless unless verified before release. In the rollback drill, retaining the immutable previous image tag (`local/upsk-system-design-api:rollback`) allowed restoring service in under 120 seconds, whereas rebuilding or attempting to "fix forward" under outage pressure took orders of magnitude longer.

### 2. What "Done" Truly Means After Deploying
- Deploying code is not the finish line—verification is. A deployment is not complete when the container starts or when `/health` returns `{ ok: true }`.
- **Definition of Done:**
  1. **Readiness Verification:** `/ready` confirms database (`SELECT 1`) and Redis (`PING`) respond within 2,000 ms.
  2. **Automated Smoke Verification:** `smoke-verify.ps1` executes real, authenticated API transactions against business routes (`POST /links`, `GET /r/:code`, `POST /teams`) with HTTP 200/201 assertions.
  3. **Observation Soak Window:** The engineer observes Prometheus metrics for 15 to 30 minutes:
     - Error rate: `rate(http_requests_total{status=~"5.."}[5m]) == 0`.
     - Request latency: p95 duration remains under 500 ms threshold.
     - Memory slope: `deriv(process_resident_memory_bytes[15m])` remains flat (no creeping leaks).
     - Cardinality: `http_requests_overflow_total` does not spike.

### 3. Looking Back to Module 01: What We Know Now
If starting over from Module 01:
- We would reinforce the contract between container liveness and dependency readiness earlier. In Module 01, `HEALTHCHECK` used `/health` purely for process liveness. Knowing how insidious silent database disconnects and unapplied schema migrations are (Module 08 BREAK), we established the strict dual-probe contract: `/health` for container orchestrator restart decisions, and `/ready` (with 2s timeouts) for traffic ingress gating.
- The choice of multi-stage Debian-slim (`debian_slim`) proved essential across all modules: it provided glibc stability for native database drivers while stripping build tools and keeping image size under 512 MiB with an unprivileged `appuser`.

### 4. The Full Production Readiness Journey (Modules 01 - 08)
We transformed a local development prototype into an enterprise-grade, battle-tested distributed service:
1. **Module 01 (Containerization):** Multi-stage Docker packaging, non-root runtime, sub-512 MiB footprint.
2. **Module 02 (CI/CD Pipelines):** Sequential quality gates (lint -> build -> unit tests -> audit -> container build) with immutable git SHA tagging.
3. **Module 03 (Environment Management):** Centralized fail-fast environment validation with zero plaintext secrets in code or logs.
4. **Module 04 (Observability):** Structured JSON logs with correlated `request_id`, Prometheus metrics with bounded route cardinality, and route-aware alerting.
5. **Module 05 (Failure Mode Analysis):** Exhaustive dependency failure mapping, strict fail-closed security for authentication and critical mutations.
6. **Module 06 (Graceful Degradation):** Aggressive timeouts, jittered exponential backoffs, BullMQ database fallback, and Redis circuit-breaking.
7. **Module 07 (Runbooks & Operational Docs):** Copy-pasteable 3 AM checklist runbooks hardened with pre-flight secret-free environment guards against config drift.
8. **Module 08 (Deploy & Verify):** Zero-downtime rolling deploys, deep `/ready` gating, automated smoke verification, and sub-2-minute automated rollback.

---

## 2. Final Verification Evidence & NOT EXECUTED Boundaries

A clean, reproducible verification pass was executed in the workspace without modifying `package.json` or `prisma/`:
- **Startup Fail-Fast:** Missing `DATABASE_URL` (exit 1), invalid `NODE_ENV=prod` (exit 1), production startup error sanitized without stack trace.
- **Lint:** `oxlint --type-aware src/ test/` -> 6 pre-existing unbound-method warnings, 0 errors (`LINT_EXIT=0`).
- **Nest Build:** `BUILD_EXIT=0`.
- **Jest Suites:** All 13 suites / 78 tests passed across 5 groups (`JEST_GRP1_EXIT=0` through `JEST_GRP5_EXIT=0`).
- **Git Diff:** `git diff --check` -> `DIFF_CHECK_EXIT=0` (clean tree, workspace `.env`, `package.json`, and `prisma/` untouched).
- **Docker Info:** `DOCKER_INFO_EXIT=0` (0 running containers; live container checks marked `NOT EXECUTED`).
- **TCP Reachability (Port 5432):** `False` (live PostgreSQL and live HTTP checks marked `NOT EXECUTED`).
