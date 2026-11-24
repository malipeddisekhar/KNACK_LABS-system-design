# Production Readiness — Module 03 FIX: Environment Hardening

Run from `D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api` on 2026-11-23.

## Failure modes, fixes, and remaining gates

| BREAK finding | Fix or preserved guardrail | Verification / remaining gate |
|---|---|---|
| Missing or malformed required configuration | Preserved `validateEnvironment` fail-fast checks for explicit `NODE_ENV`, `PORT` outside test, `JWT_SECRET`, `DATABASE_URL`, staging/production `REDIS_URL` and `PUBLIC_BASE_URL`, explicit `CORS_ORIGINS`, and valid `LOG_LEVEL`. Values are validated without echoing them. | Startup drills below exited 1 with the expected setting/mode message and no credential values. URL validation checks syntax, not service reachability. |
| Unsafe mode fallback | Preserved explicit mode selection; there is no default to development. `test`-only defaults remain limited to test mode. Platform deployment must still set the correct `NODE_ENV` for each tier. | Invalid `NODE_ENV=prod` drill failed closed. Deployment manifest/secret-store configuration was not available for inspection. |
| Production startup diagnostics | Preserved delayed framework logging and the bootstrap catch. Production startup failures return only a fixed redacted line; other modes expose only the fixed environment-validation message or a generic initialization message. | Production missing-database drill returned the redacted line, exit 1, without a stack or supplied values. |
| Sensitive details in 4xx response messages | Hardened `HttpExceptionFilter`: client messages containing credential labels, bearer tokens, database/cache connection URLs, common connection errors, Prisma internal error names, or stack-trace markers now become `Request could not be completed.` Ordinary curated validation messages remain unchanged. 4xx server logs continue to record only the stable error code. Added regression tests for both redaction and ordinary-message preservation. | Config/filter Jest suite passed 15/15. This is targeted marker-based redaction, so application code must still avoid embedding unmarked secrets or raw request values in exception messages. |
| CORS or transport misconfiguration | Preserved explicit origin allowlists, rejection of wildcard origins and credentialed cookies, origin-only URL validation, and HTTPS enforcement for production CORS/public URLs. | Static validation and unit tests ran; live CORS/HTTPS behavior against a listening deployment is **NOT EXECUTED**. The operator must supply trusted production origins. |
| Git/Docker secret exposure | Preserved `.gitignore` rules for `.env*` with `.env.example` exception and `.dockerignore` exclusions for env files, npm config, credentials, and key material. No changes were needed. | Static file review only. Docker context/image inspection is **NOT EXECUTED** because Docker Engine access is denied. Ignore rules do not remove secrets already committed/tracked. |
| Test database isolation | Preserved the separate `TEST_DATABASE_URL` requirement and exact `url_shortener_test` guard in test setup and `PrismaService`; no fallback to `DATABASE_URL`. | Mocked suites passed. Port 5432 was unreachable, so DB-backed setup/migrations and live PostgreSQL/HTTP checks are **NOT EXECUTED**. |

No edits were made to `package.json`, `prisma/`, `src/app.module.ts`, `src/main.ts`, `.env.example`, `.gitignore`, or `.dockerignore`. The targeted implementation change is limited to `src/common/http-exception.filter.ts` and regression coverage in `src/common/http-exception.filter.spec.ts`.

## Startup failure-first drills

Inputs used synthetic test values only; drills ran with the working directory set to the system temporary directory so a workspace `.env` could not override the test environment. No secret values were printed.

```text
=== missing DATABASE_URL startup drill ===
Startup configuration error: DATABASE_URL is required.
exit=1
=== invalid NODE_ENV=prod startup drill ===
Startup configuration error: NODE_ENV must be one of development, staging, production, or test.
exit=1
=== production redaction startup drill ===
Startup failed; sensitive details redacted.
exit=1
```

The production drill deliberately omitted `DATABASE_URL`; it confirms generic startup redaction on a configuration failure, not redaction for every possible failure in a live production deployment.

## Verification commands and exact results

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

Exit code: `0`; six existing warnings in the team contract spec, no warning in the changed exception filter.

### Nest build

Command: `node ./node_modules/@nestjs/cli/bin/nest.js build`

```text
<no stdout or stderr>
```

Exit code: `0`.

### Environment and exception-filter tests

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand`

```text
(node:14384) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       15 passed, 15 total
Snapshots:   0 total
Time:        23.958 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```

Exit code: `0`.

### Team activity/feed regression suites

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand`

```text
(node:26144) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        22.621 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

Exit code: `0`.

### Whitespace check

Command: `git diff --check`

```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', LF will be replaced by CRLF the next time Git touches it
```

Exit code: `0`; no whitespace errors.

### Docker daemon

Command: `docker info`

```text
Client version: 29.9.2
Context: desktop-linux
Server:
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Exit code: `1`. Docker build/run/health/image checks are **NOT EXECUTED**.

### PostgreSQL

Command: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet`

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Live PostgreSQL/HTTP checks and DB-backed integration tests are **NOT EXECUTED**.

## UPSK reachability

CLI version: `upsk 0.1.30`. The first CLI status check at `2026-11-23 08:54:42 UTC` failed with `Cannot reach UPSK server at api.upsk.to (connection; source: --api-url)`. An initial browser-tool probe could not access the URL, but the single approved PowerShell HTTPS probe then succeeded:

```text
HTTP 200
{"ok":true,"version":"v1"}
```

After that health success, the protocol-required CLI status retry at `2026-11-23 09:02:42.053 UTC` still failed:

```text
{"timestamp_unix_ms":1795424562053,"level":"error","message":"command.failed","context":{"command":"status"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

The one `next` attempt with the summary/evidence above failed at `2026-11-23 09:02:59.941 UTC` with:

```text
{"timestamp_unix_ms":1795424579941,"level":"error","message":"command.failed","context":{"command":"next"}}
Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN. Try: upsk --api-url https://api.upsk.to status. Windows reinstall: powershell -NoProfile -ExecutionPolicy Bypass -Command "irm https://www.upsk.to/install.ps1 | iex"
```

The local `last_error.json` still says it could not read an older Module 05 report path and has no current correlation, request, or error IDs, so it appears stale. The successful health probe only confirms that endpoint was reachable; the CLI calls still failed at connection, so the Module 03 checkpoint has **not** advanced.
