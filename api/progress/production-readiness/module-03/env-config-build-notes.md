# Production Readiness — Module 03 BUILD: Environment Configuration

## Chunk 1 — Fail-fast startup configuration

`validateEnvironment` in `src/app.module.ts` now validates the active mode before app initialization. `NODE_ENV` has no runtime fallback and accepts `development`, `staging`, `production`, or the test-only `test` mode. Runtime configuration requires an explicit `PORT`, `JWT_SECRET`, and `DATABASE_URL`; staging and production also require `REDIS_URL` and `PUBLIC_BASE_URL`. `CORS_ORIGINS` and `LOG_LEVEL` are required outside tests. URLs are validated without including values in errors. Test mode alone may default the port to 3000, omit CORS origins, and use `error` logging; development alone may omit Redis and use the loopback public URL fallback. `RETENTION_DAYS` remains optional with a validated default of 30.

The `DATABASE_URL` setting is required in test mode as well. Database-backed tests still use the existing safety guard and must provide an explicit `TEST_DATABASE_URL` that targets `url_shortener_test`; it is never derived from or copied from `DATABASE_URL`.

The application-module import is dynamic inside the caught startup promise, and `NestFactory.create` uses `abortOnError: false`, so validation errors reach the startup handler. Framework logging stays suppressed until validation and app creation complete. Invalid configuration exits with code 1 and a safe diagnostic; production startup failures print only a generic redacted message and no stack.

## Chunk 2 — Environment-aware behavior

| Environment | Configuration and behavior |
|---|---|
| `development` | Explicit `NODE_ENV`, `PORT`, `JWT_SECRET`, `DATABASE_URL`, `CORS_ORIGINS`, and `LOG_LEVEL`; debug/verbose logging is allowed. An explicit origin allowlist is required and wildcard origins are rejected. Redis may be omitted for local fallback behavior. |
| `staging` | Explicit mode, port, secret, database, Redis, public URL, origins, and log level. Public/CORS origins are explicit; debug and verbose levels are rejected. |
| `production` | Same required settings as staging; `PUBLIC_BASE_URL` and allowed CORS origins must use HTTPS. Only `error`, `warn`, or `log` verbosity is allowed. Startup failures are redacted; 5xx responses are generic and exception detail/stack is not logged or returned. |
| `test` | Explicit test mode, required JWT/database settings, no CORS origins by default, and `error` verbosity if omitted. The database safety guard still requires the dedicated `url_shortener_test` target for DB-backed tests. |

`src/main.ts` enables CORS with only the validated origin list, disables credential cookies, and explicitly configures methods, allowed headers, the exposed request-ID header, and max age. It applies the validated Nest log-level list. After the server listens, it emits one allowlisted structured startup line containing only `event`, `environment`, `port`, and `log_level`; no environment object, URL, secret, or credential is serialized.

`HttpExceptionFilter` always returns a generic message for 5xx responses. It records only safe error codes and request metadata; production detail is labeled redacted and stack traces are never serialized. Startup configuration errors include only fixed validation text naming the missing/invalid setting, never the supplied value. Redis, readiness, analytics, and worker failure logs were changed to omit raw exception messages that could contain connection details.

## Chunk 3 — `.env` vs. `.env.example` and secret boundaries

`.env.example` now labels each variable REQUIRED or OPTIONAL and contains empty values for secret/database credentials, not usable secrets. It documents the accepted mode, URL/origin requirements, production log restrictions, and the test database boundary. The API `.gitignore` excludes `.env` and `.env.*` while retaining `.env.example`, and excludes common private-key and local credential directories. The existing `.dockerignore` excludes `.env*`, `.npmrc`, credentials/private keys, local dependencies, build/test output, caches, and progress files while retaining `.env.example`. No actual `.env` file was inspected or printed. `git ls-files -- .env .env.*` listed only `.env.example`; `git check-ignore --no-index -v` matched `.env`, `.env.production`, and `.env.local` to the ignore rules.

No changes were made to `package.json` or `prisma/`; Prisma changes already present in the workspace predated this task.

## Failure-first drills

The compiled startup was invoked with a non-secret fixture environment, first with `DATABASE_URL` empty and then with an unsupported `NODE_ENV=prod`. Expected behavior was a nonzero exit, a precise safe configuration message, and no stack trace or supplied configuration value. Observed output:

```text
=== startup drill: missing DATABASE_URL ===
Startup configuration error: DATABASE_URL is required.
startup-exit=1
=== startup drill: invalid NODE_ENV ===
Startup configuration error: NODE_ENV must be one of development, staging, production, or test.
startup-exit=1
```

Production redaction drill, with a missing required setting:

```text
=== production startup redaction drill ===
Startup failed; sensitive details redacted.
startup-exit=1
```

The configuration unit tests assert these exact missing/invalid error messages; a production exception-filter test verifies a generic 500 envelope and that neither diagnostic text nor stack material reaches logs. The startup success log could not be observed against a live API because PostgreSQL was unreachable; source inspection confirms its explicit allowlist.

## Exact verification outputs

Commands ran from `D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api`.

### Lint

Command: `& 'C:\Program Files\nodejs\npm.cmd' run lint`

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

Exit code: `0`; six warnings, lint passed.

### Nest build

Command: `node ./node_modules/@nestjs/cli/bin/nest.js build`

Output: no stdout/stderr. Exit code: `0`.

### Configuration and production error-redaction tests

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand`

```text
(node:16444) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        7.179 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```

Exit code: `0`.

### Requested mocked team suites

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand`

```text
(node:5004) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        6.267 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

Exit code: `0`.

### `git diff --check`

```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
```

Exit code: `0`; no whitespace errors.

### Docker daemon

Command: `docker info`

```text
Client:
 Version:    29.9.2
 Context:    desktop-linux
 Debug Mode: false
 Plugins:
  agent: Docker AI Agent Runner (Docker Inc.)
    Version:  v1.152.0
    Path:     C:\Users\malip\.docker\cli-plugins\docker-agent.exe
  ai: Docker AI Agent - Ask Gordon (Docker Inc.)
    Version:  v1.33.0
    Path:     C:\Users\malip\.docker\cli-plugins\docker-ai.exe
  buildx: Docker Buildx (Docker Inc.)
    Version:  v0.38.1
    Path:     C:\Users\malip\.docker\cli-plugins\docker-buildx.exe
  compose: Docker Compose (Docker Inc.)
    Version:  v5.6.1
    Path:     C:\Users\malip\.docker\cli-plugins\docker-compose.exe
  debug: Get a shell into any image or container (Docker Inc.)
    Version:  0.49.0
    Path:     C:\Users\malip\.docker\cli-plugins\docker-debug.exe
  desktop: Docker Desktop commands (Docker Inc.)
    Version:  4.98.0
    Path:     C:\Users\malip\.docker\cli-plugins\docker-desktop.exe
  dhi: Manages Docker Hardened Images (Docker Inc.)
    Version:  v0.0.9
    Path:     C:\Users\malip\.docker\cli-plugins\docker-dhi.exe
  extension: Manages Docker extensions (Docker Inc.)
    Version:  v0.2.32
    Path:     C:\Users\malip\.docker\cli-plugins\docker-extension.exe
  init: Creates Docker-related starter files (Docker Inc.)
    Version:  v1.4.1
    Path:     C:\Users\malip\.docker\cli-plugins\docker-init.exe
  mcp: Docker MCP Plugin (Docker Inc.)
    Version:  v0.44.2
    Path:     C:\Users\malip\.docker\cli-plugins\docker-mcp.exe
  model: Docker Model Runner (Docker Inc.)
    Version:  v1.2.9
    Path:     C:\Users\malip\.docker\cli-plugins\docker-model.exe
  offload: Docker Offload (Docker Inc.)
    Version:  v0.7.35
    Path:     C:\Users\malip\.docker\cli-plugins\docker-offload.exe
  pass: Docker Pass Secrets Manager (beta) (Docker Inc.)
    Version:  v0.3.2
    Path:     C:\Users\malip\.docker\cli-plugins\docker-pass.exe
  sandbox: "docker sandbox" is deprecated, use Docker Sandboxes instead (Docker Inc.)
    Version:  v0.13.0
    Path:     C:\Users\malip\.docker\cli-plugins\docker-sandbox.exe
  scout: Docker Scout (Docker Inc.)
    Version:  v1.27.0
    Path:     C:\Users\malip\.docker\cli-plugins\docker-scout.exe

Server:
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Exit code: `1`. Live Docker build, run, health, and image checks are **NOT EXECUTED**.

### PostgreSQL reachability

Command: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet`

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Live PostgreSQL/HTTP checks are **NOT EXECUTED**.
