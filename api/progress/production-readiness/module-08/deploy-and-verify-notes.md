# Module 08: Deploy & Verify — Architecture and Build Notes

**Date:** 2026-11-24  
**Module:** 08 — Deploy & Verify (Capstone)  
**Decisions Carried Forward:**
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

## 1. Decision Defense: Rolling Deploy & Automated Rollback

### Decision 1: Deploy Strategy = Rolling
- **Context:** `url-shortener-api` is a stateless NestJS HTTP service backed by PostgreSQL (managed via Prisma) and Redis.
- **Tradeoff Analysis:**
  - *Blue-Green:* Requires running duplicate infrastructure (2x compute resources) and doubles database pool pressure (each instance allocates up to 10 connections). While blue-green provides an atomic cutover, schema migrations in PostgreSQL are shared across both environments anyway, meaning database migrations still require expand-and-contract discipline.
  - *Rolling Deploy (Selected):* Incrementally replaces old container instances with new ones without service downtime. No extra infrastructure cost or pool exhaustion.
  - *Database Safety Requirement:* In rolling deployments, old and new application instances query the database concurrently during the transition window. All Prisma schema migrations must be strictly additive (expand-and-contract: add nullable columns or new tables in phase 1, deploy code in phase 2, clean up deprecated columns in phase 3).

### Decision 2: Rollback Approach = Automated
- **Context:** Production incidents during deployment require instant mitigation before customer impact cascades.
- **Tradeoff Analysis:**
  - *Manual Rollback:* Human latency introduces delays (average 15-20 minutes to notice, convene, and decide). At 3 AM or during off-hours, this lag causes customer churn and tempts engineers to "fix forward" in panic.
  - *Automated Rollback (Selected):* The platform and smoke verification runner poll `/ready` during the rollout. If `/ready` returns non-200 or fails 3 consecutive health checks within 60 seconds, or if Prometheus alert `HighErrorRate` fires (>5% 5xx over 5 minutes), deployment aborts and automatically triggers rollback to the immutable rollback image tag (`local/upsk-system-design-api:rollback`).

---

## 2. Chunk 1: Platform Setup & Secret Hygiene

### Configuration & Secret Injection Contract
- **Environment Ingress:** All configuration values (`NODE_ENV`, `PORT`, `JWT_SECRET`, `DATABASE_URL`, `REDIS_URL`, `PUBLIC_BASE_URL`, `CORS_ORIGINS`, `LOG_LEVEL`) must be injected by the deployment platform or local container orchestrator via encrypted environment variables.
- **Zero Secrets in Code or Logs:** No `.env` files are baked into container images (`.dockerignore` excludes `.env`). No credentials appear in pipeline logs or command-line parameters.
- **Secret-Free Verification:**
  To verify environment provisioning without exposing sensitive connection strings or passwords, operators run the pre-flight key inspection script:
  ```powershell
  node --input-type=module -e "import 'dotenv/config'; const keys = Object.keys(process.env).filter(k => /(DATABASE|DB_|POSTGRES|PG|JWT|SECRET)/i.test(k)).sort(); console.log(JSON.stringify({ cwd: process.cwd(), has_DATABASE_URL: Boolean(process.env.DATABASE_URL), has_JWT_SECRET: Boolean(process.env.JWT_SECRET), matching_keys: keys }));"
  ```
  Expected output confirms variable presence while protecting values:
  `{"cwd":"...","has_DATABASE_URL":true,"has_JWT_SECRET":true,"matching_keys":["DATABASE_URL","JWT_SECRET","TEST_DATABASE_URL"]}`.

---

## 3. Chunk 2: Liveness & Readiness Hardening

### Endpoint Separation of Concerns
| Endpoint | Responsibility | Downstream Checks | HTTP Statuses |
|---|---|---|---|
| `GET /health` (and alias `GET /live`) | Process liveness only. Answers: *Is the Node.js event loop and Express server running?* | None (lightweight, zero dependency calls). | `200 OK` `{"ok":true}` |
| `GET /ready` | Instance traffic readiness. Answers: *Can this instance successfully query dependencies to serve user traffic?* | PostgreSQL (`SELECT 1;`) and Redis (`PING`) bounded by 2,000 ms timeouts. | `200 OK` if both up; `503 Service Unavailable` with sanitized status if either down. |

### Flapping Prevention (Dependency Timeouts)
If PostgreSQL or Redis suffers severe latency, a readiness probe that hangs until platform timeout (e.g., 5-10s) causes cascading container restarts and flapping.
`src/ready.controller.ts` eliminates this via strict application timeouts:
```typescript
const READINESS_TIMEOUT_MS = 2000;
await this.withTimeout(this.prisma.$queryRaw`SELECT 1;`, 'postgres', 'readiness_query');
await this.withTimeout(this.cacheService.ping(), 'redis', 'readiness_ping');
```
If a dependency takes >2,000 ms, `DependencyTimeoutError` is logged with `appLogger.logDependencyTimeout` and the check returns `down` immediately, returning HTTP 503 within 2 seconds.

---

## 4. Chunk 3: CI/CD Pipeline Integration & Smoke Gates

### Immutable Image Tagging
Every deployment artifact is built from git commit SHA, producing immutable tags:
`local/upsk-system-design-api:$SHA`
The tag `latest` is strictly prohibited because it obscures code provenance.

### Post-Deployment Verification Pipeline Stages
1. **Pre-Deploy Gates:** Lint (`oxlint`), compile (`nest build`), unit/integration test suites (all 13 Jest suites pass), security audit.
2. **Atomic Rollout:** Start new container with `$releaseImage`.
3. **Smoke Verification Gate:**
   - Poll `GET /ready` for up to 30 attempts with 2s intervals (60s budget).
   - Execute smoke requests: `GET /health` (`200`), `GET /ready` (`200`), `GET /metrics` (`200`).
4. **Automated Rollback Trigger:**
   If the smoke verification gate fails or times out, the pipeline executes rollback:
   `docker run ... 'local/upsk-system-design-api:rollback'`
   Traffic is restored to the known-good version within seconds.

### Operational Policy: Off-Hours Deployments
- Automated smoke verification gates and 15-minute metric observation windows are mandatory.
- A deployment freeze is recommended after 4:00 PM on Fridays to prevent weekend recovery overhead unless emergency remediation is authorized.

---

## 5. Chunk 4: Rollback Drills & Verification

### Rollback Drill Procedure (Local Docker Host)
1. **Current Working Version:** Container running commit `$HEAD_SHA`.
2. **Deploy Sequence:**
   Tag current container image as `local/upsk-system-design-api:rollback`.
   Build and start new version `local/upsk-system-design-api:$NEW_SHA`.
3. **Failure Detection:**
   If `GET /ready` returns 503 or probe fails, immediately invoke rollback:
   ```powershell
   docker rm --force url-shortener-api
   docker run --detach --name url-shortener-api --restart unless-stopped --env-file .env --publish 3000:3000 'local/upsk-system-design-api:rollback'
   ```
4. **Target Recovery Time:** Rollback execution and recovery verified in under 120 seconds.
