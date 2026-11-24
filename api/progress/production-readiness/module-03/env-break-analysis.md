# Production Readiness — Module 03 BREAK: Environment and Configuration Risks

## Findings: cause, manifestation, and existing mitigation

| Failure mode | Root cause and how it manifests | Current mitigation / remaining risk |
|---|---|---|
| Missing required settings or malformed values | Absent `NODE_ENV`, runtime `PORT`, `JWT_SECRET`, or `DATABASE_URL` stops configuration validation before the API listens. Invalid enum, port, secret shape, PostgreSQL/Redis URL, origin, or retention values fail with a fixed message naming the setting. | `validateEnvironment` rejects bad inputs without printing their values. Runtime drills confirmed missing `DATABASE_URL` and invalid `NODE_ENV=prod` exit 1. The allowlisted `.env.example` deliberately leaves secret/database values blank. A valid URL is syntax-checked; validation does not prove the database or Redis is reachable. |
| Unsafe active-mode fallback or wrong mode selection | No `NODE_ENV` default is supplied. But an operator could set `NODE_ENV=development` on a deployed service and thereby enable debug/verbose logs and development fallbacks. Explicit `NODE_ENV=test` permits test-only defaults and omitting CORS origins. | The platform is expected to inject `NODE_ENV` (`platform_env` strategy); staging/production require explicit Redis/public URL and reject debug/verbose. Production public/CORS origins require HTTPS. Deployment configuration still needs an external policy to ensure the selected mode matches the deployment tier. Test mode has a separate DB guard described below. |
| Service URL parses but target is unavailable/wrong | `DATABASE_URL` and `REDIS_URL` are checked for URL syntax, scheme, host, and database path, not for a successful connection or the intended environment's host/database identity. A syntactically valid but unreachable target can pass startup validation and fail on use/readiness. | Runtime readiness reports DB/Redis availability, but no live service was available during this pass. `DATABASE_URL` environment identity is managed by platform configuration; only DB-backed tests have an exact database-name guard. Docker and PostgreSQL/HTTP behavior remain **NOT EXECUTED**. |
| Error detail, stack, or secret leakage | An uncaught startup/config exception could otherwise emit a stack; server/framework initialization can also log errors before the custom catch. A 4xx `HttpException` message is passed through to the HTTP response, so a future caller that embeds connection/secret data in such a message could expose it. | Startup disables framework logging until validation, dynamically imports `AppModule` inside a caught promise, and creates Nest with `abortOnError: false`. Production startup failures use a fixed redacted line; 5xx responses are generic and exception text/stack is not logged. **Residual risk:** no production allowlist/scrubbing is applied to 4xx client messages; current filter tests cover 5xx redaction, not hostile/detailed 4xx messages. Keep 4xx exceptions free of secrets and add a regression test if response redaction policy is tightened. |
| Over-broad CORS or non-HTTPS production origin | A wildcard origin would permit arbitrary browser origins; an HTTP production origin could expose browser traffic to interception. | The validator rejects `*`, requires explicit origins, validates origin-only URLs, disallows credential cookies, and requires HTTPS for production CORS and public base URLs. The configured allowlist still depends on an operator choosing only trusted HTTPS origins. CORS behavior was not probed against a live HTTP server. |
| Environment/config files included in Git or Docker context | Committing `.env`/credential material leaks secrets into history; a broad Docker context can copy local environment files or keys into image layers. Ignore rules cannot remove a file already tracked. | `.gitignore` ignores `.env` and `.env.*` with `.env.example` exception plus common key/credential paths. `.dockerignore` excludes environment files, `.npmrc`, key/credential paths, and local artifacts, retaining only the safe example. `git ls-files -- .env .env.*` returned only `.env.example`, whose secret/DB values are blank. Static ignore review was possible; Docker context/image inspection is **NOT EXECUTED**. |
| Test DB leaks into development/production | Tests that derive their URL from `DATABASE_URL` can mutate the wrong database; a test can pass locally only because seed rows already exist. | `test/setup-test-db.ts` requires a separately configured `TEST_DATABASE_URL`, never derives it from `DATABASE_URL`, and requires its database name to be exactly `url_shortener_test` before assigning it to the test process. `PrismaService` repeats the name guard when test mode/Jest is detected. Missing/incorrect test URL fails closed. The live DB connection and migrations were **NOT EXECUTED** because port 5432 was unreachable; the requested two Jest suites are mocked and do not prove database isolation at runtime. |

## Failure-first drills

Using a controlled fixture environment (with no real credentials printed), the compiled startup was tested for the three requested failure cases:

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

Each failed before the API listened; no stack trace or supplied value appeared in the output. The production drill used a missing required value and confirmed the fixed generic message.

## Verification outputs

Commands were run from `D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api`.

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

### Configuration and exception-filter suite

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand`

```text
(node:10976) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        4.406 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```

Exit code: `0`.

### Mocked team activity/feed suites

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand`

```text
(node:25116) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        6.331 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

Exit code: `0`.

### `git diff --check`

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

Exit code: `1`. Docker build, image inspection, container run/health, and image-size checks are **NOT EXECUTED**.

### PostgreSQL reachability

Command: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet`

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Live PostgreSQL/HTTP checks and live DB-backed integration tests are **NOT EXECUTED**.

## UPSK boundary

The read-only `upsk status --json` check could not reach `api.upsk.to` (connection error, source `--api-url`). No advancement is claimed from this environment.
