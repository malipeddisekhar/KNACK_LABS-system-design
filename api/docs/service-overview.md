# URL Shortener API — Service Overview

## Purpose

The service creates and manages short links, redirects visitors, and records click analytics. It also provides team collaboration endpoints for invitations, comments, audit records, and ordered activity events.

## Dependencies and failure behavior

| Dependency | Connection/use | When unavailable | Module 06 bounds, breaker, retries, or fallback |
|---|---|---|---|
| PostgreSQL | Prisma PostgreSQL adapter; configured with `DATABASE_URL`. API pool maximum is 10; connect timeout 2,000 ms, statement timeout 3,000 ms, query timeout 3,500 ms, idle timeout 30,000 ms. | Readiness becomes not-ready; required reads and critical writes fail closed. | No PostgreSQL circuit breaker is configured. The readiness operation waits at most 2,000 ms at the application layer; the underlying promise is not cancelled by that race. Test runs must use `TEST_DATABASE_URL` targeting exactly `url_shortener_test`. |
| Redis redirect cache | ioredis; configured with `REDIS_URL`; local default in development/test is `127.0.0.1:6379`. | Redirect cache read treats Redis failure as a cache miss and falls back to PostgreSQL. Cache invalidation/write is best-effort, so stale values can remain until TTL expiry. | Redis connect timeout 1,500 ms and command timeout 1,000 ms. Redirect-cache read breaker opens after 3 failures for 5,000 ms, then admits one half-open probe. Reconnect uses up to 3 jittered delays with ceilings 200/400/800 ms (maximum below 1,000 ms). |
| Redis / BullMQ analytics queue | BullMQ queue and worker share Redis; `REDIS_URL`; default local Redis port 6379. | Click enqueue falls back to a direct PostgreSQL event write. If queue and fallback write both fail, the API logs a sanitized error and still returns an event ID; that ID does not prove durable analytics. | Bull connection timeout 2,000 ms; `maxRetriesPerRequest: null` is required by BullMQ. Enqueue uses an application timeout and one retry for recognized transient errors; jobs use 3 attempts with 500 ms exponential backoff and 0.5 jitter. The Redis redirect-read breaker does not protect BullMQ. |
| External HTTP / geocoding APIs | None are wired in the current application modules. | No current request path depends on a geocoding or other external HTTP provider. | No external-provider timeout, breaker, retry, or fallback is configured. Reassess and add explicit budgets before introducing one. |
| DNS | Hostname resolution is performed by the operating system/runtime for configured PostgreSQL and Redis hostnames. | `ENOTFOUND`/resolution failures prevent the dependent connection; app-level readiness and cache/queue handling apply after the client reports the failure. | No separate application DNS timeout or retry policy is configured. Recognized transient dependency errors may be retried only by bounded call sites. |
| Node.js / container runtime | Node 20 slim image; HTTP server listens on configured `PORT` and `0.0.0.0`. Docker image defines `HEALTHCHECK`; runtime user is `appuser`. | CPU/event-loop stalls, memory exhaustion, or a stopped container affect all requests in that process. | HTTP request timeout 30,000 ms, keep-alive 65,000 ms, headers timeout 66,000 ms. Dockerfile does not set CPU/memory limits; configure those at the deployment platform. Readiness timeout is 2,000 ms. There is no runtime-wide circuit breaker. |

Retry helper `retryTransient` only retries recognized transient codes, rejects invalid retry budgets, and caps configured retries at 5. Its limits apply only where callers use it; they do not create a global database retry policy. The breaker is in-process and protects only Redis redirect-cache reads.

## Endpoints

| Method and path | Purpose / access |
|---|---|
| `GET /health` | Process liveness only; returns `{"ok":true}`. It does not prove PostgreSQL or Redis readiness. |
| `GET /ready` | Checks PostgreSQL and Redis; returns `200` with `status: ready` when both are available, otherwise sanitized `503` with dependency status fields. |
| `GET /metrics` | Prometheus text exposition, including bounded HTTP request series, duration histogram, process metrics, and a team-count availability gauge. Restrict scraping at the network layer. |
| `POST /auth/login` | Authenticates and issues a token; rate limited. |
| `POST /links` | Create a link; authenticated, rate limited. |
| `GET /links`, `GET /links/search`, `GET /links/:id` | List, search, or retrieve caller-owned links; authenticated. |
| `PATCH /links/:id`, `DELETE /links/:id` | Update or delete caller-owned links; authenticated. |
| `GET /links/:id/analytics` | Query link analytics; authenticated and rate limited. Analytics persistence is performed asynchronously by the worker where possible. |
| `GET /r/:code` | Resolve a short code and issue a `302` redirect; rate limited. Redis cache reads fall back to PostgreSQL. |
| `POST /teams` | Create a team; authenticated. Creator becomes `OWNER`. |
| `POST /teams/:id/invitations`, `DELETE /teams/:id/invitations/:invitationId` | Create or revoke invitations; live `OWNER`/`ADMIN` membership required. |
| `POST /teams/invitations/accept` | Accept a recipient-bound invitation; authenticated. |
| `GET /teams/:id/activity`, `GET /teams/:id/activity/stream` | Read ordered activity or subscribe to SSE; live team membership required. Stream supports reconnect cursors and heartbeat handling. |
| `POST /teams/:id/activity/stream/:connectionId/pong` | Acknowledge an SSE heartbeat; live team membership required. |
| `POST /teams/:id/comments`, `GET /teams/:id/comments` | Create or list team comments; live team membership required. |
| `GET /teams/:id/audit-logs` | Read filtered audit records; live `OWNER`/`ADMIN` membership required. |

The analytics worker consumes BullMQ jobs; it has no separate HTTP endpoint. Team role checks query current membership rather than trusting a stale role claim.

## Configuration and restart policy

All environment configuration is validated at process startup. Changes require a process/container restart; secrets must come from the deployment secret store or a protected local `.env`, never from source or command-line arguments.

| Variable | Requirement | Restart? |
|---|---|---|
| `NODE_ENV` | Required; `development`, `staging`, `production`, or `test`. | Yes |
| `PORT` | Required outside test mode; integer 1–65535. | Yes |
| `JWT_SECRET` | Required; at least 32 characters with diversity. | Yes |
| `DATABASE_URL` | Required; PostgreSQL URL. | Yes |
| `REDIS_URL` | Optional in development/test; required in staging/production. Supports `redis:`/`rediss:`. | Yes |
| `PUBLIC_BASE_URL` | Optional in development/test; required in staging/production; production requires HTTPS. | Yes |
| `CORS_ORIGINS` | Required outside test mode; explicit comma-separated origins, no wildcard; HTTPS in production. | Yes |
| `LOG_LEVEL` | Required outside test mode; staging/production allow `error`, `warn`, `log` only. | Yes |
| `RETENTION_DAYS` | Optional; default 30, integer 1–3650. | Yes |
| `TEST_DATABASE_URL` | Test-only; required for DB-backed tests and must point to database name `url_shortener_test`. Never derive it from `DATABASE_URL`. | Yes, test process only |

`src/database/prisma.service.ts`, `src/cache/cache.service.ts`, `src/common/bull-config.ts`, `src/common/resilience.ts`, and `src/main.ts` own the timeout/retry/server bounds described above. These bounds are code settings, not environment overrides; changing them requires a reviewed code change and redeploy.

## Deploy and rollback commands

The checked-in CI workflow builds and pushes an immutable commit-SHA image on `main`; this repository contains no production deployment target or deployment job. The following copy-pasteable commands are for a **local Docker host only**. They intentionally refuse to build from a dirty Git tree. The target workspace currently has uncommitted changes, so the guard will stop until the intended release is committed. Docker engine access and these commands have not been verified in the current environment.

### Local deploy

Run in PowerShell from the API directory after securely provisioning `.env` and starting Docker Desktop:

```powershell
Set-Location -LiteralPath 'D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api'
$changes = git status --porcelain
if ($LASTEXITCODE -ne 0) { throw 'Unable to read Git status.' }
if ($changes) { throw 'Refusing deployment from a dirty worktree; commit the intended release first.' }
$releaseSha = (git rev-parse --verify HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to resolve the release commit.' }
$releaseImage = "local/upsk-system-design-api:$releaseSha"
$previousImage = & docker inspect --format '{{.Config.Image}}' url-shortener-api 2>$null
$hadPrevious = ($LASTEXITCODE -eq 0 -and [bool]$previousImage)
docker build --tag $releaseImage .
if ($LASTEXITCODE -ne 0) { throw 'Docker build failed; running container was not replaced.' }
if ($hadPrevious) {
  docker image tag $previousImage 'local/upsk-system-design-api:rollback'
  if ($LASTEXITCODE -ne 0) { throw 'Could not preserve the running image for rollback.' }
  docker rm --force url-shortener-api | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Could not replace the prior local API container.' }
}
docker run --detach --name url-shortener-api --restart unless-stopped --env-file .env --publish 3000:3000 $releaseImage
if ($LASTEXITCODE -ne 0) { throw 'Container start failed; use the rollback command if a rollback image exists.' }
curl.exe --silent --show-error --fail --max-time 3 http://127.0.0.1:3000/health
if ($LASTEXITCODE -ne 0) { throw 'Liveness check failed; use the rollback command.' }
curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/ready
```

Expected liveness response: HTTP `200` and `{"ok":true}`. Expected readiness response: HTTP `200` and `status: ready`; a `503` is a failed release check. If this is the first deployment, there is no previous image to roll back to until one is explicitly retained.

### Local container rollback

This restores the image saved as `local/upsk-system-design-api:rollback` by the deploy sequence. It does not roll back database migrations. For non-backward-compatible schema changes, stop and follow the approved recovery plan; prefer a reviewed forward fix over destructive database rollback.

```powershell
Set-Location -LiteralPath 'D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api'
docker image inspect 'local/upsk-system-design-api:rollback' | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Rollback image is not present; do not remove the current container.' }
docker rm --force url-shortener-api | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Could not stop the current local API container.' }
docker run --detach --name url-shortener-api --restart unless-stopped --env-file .env --publish 3000:3000 'local/upsk-system-design-api:rollback'
if ($LASTEXITCODE -ne 0) { throw 'Rollback container failed to start; escalate to the on-call owner.' }
curl.exe --silent --show-error --fail --max-time 3 http://127.0.0.1:3000/health
curl.exe --silent --show-error --include --max-time 3 http://127.0.0.1:3000/ready
```

For Git traceability only, these safe read-only commands show the exact current release commit and recent history; they do not mutate the branch or working tree:

```powershell
git status --short
git rev-parse --verify HEAD
git log -5 --oneline --decorate
```

The PowerShell deploy/rollback commands above are local container procedures. Because no production platform target or deployment job is configured in the repository, do not present them as proof of a production release.

## Ownership and escalation

Primary response channel: `#url-shortener-oncall`. Page the secondary on-call at 10 minutes if impact is ongoing. At 15 minutes, send a concise state/impact/next-action update and confirm the secondary is engaged. Escalate to the engineering manager at 20 minutes if the incident remains unresolved or impact is expanding. Do not post secrets, tokens, raw connection strings, or user PII in incident updates.
