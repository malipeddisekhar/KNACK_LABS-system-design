# Production Readiness — Module 03 VERIFY: Environment Configuration

## Configuration contract review

Reviewed `src/app.module.ts`, `src/main.ts`, `src/common/http-exception.filter.ts`, `.env.example`, `.gitignore`, `.dockerignore`, and `env-config-build-notes.md`.

### Required and optional values

| Variable | Contract in the validator and template |
|---|---|
| `NODE_ENV` | Required with no runtime fallback. Accepted values: `development`, `staging`, `production`, and test-only `test`. |
| `PORT` | Required outside test; test-only default is 3000. Values must be integers from 1 through 65535. |
| `JWT_SECRET` | Required in all modes; minimum 32 characters, adequate character diversity, no leading/trailing or control whitespace. No committed value is provided. |
| `DATABASE_URL` | Required in all modes and must parse as a PostgreSQL URL. Database-backed tests continue to use the separate guarded `TEST_DATABASE_URL` for `url_shortener_test`. |
| `PUBLIC_BASE_URL` | Required in staging/production; development/test may use the local loopback URL. Production requires HTTPS. Must be an origin, without credentials/path/query/fragment. |
| `CORS_ORIGINS` | Required outside tests as a comma-separated explicit origin allowlist. Wildcards are rejected; production entries must be HTTPS. Test mode may omit it. |
| `LOG_LEVEL` | Required outside tests; one of `error`, `warn`, `log`, `debug`, `verbose`. Staging/production reject `debug` and `verbose`; test defaults to `error`. |
| `REDIS_URL` | Required in staging/production; optional in development/test for local fallback behavior. Accepts `redis:` or `rediss:` URLs. |
| `RETENTION_DAYS` | Optional, defaults to 30, and must be an integer from 1 through 3650. |
| `TEST_DATABASE_URL` | Required by the guarded DB-backed test setup when running those tests; otherwise optional and test-only. It must target `url_shortener_test` and is never derived from `DATABASE_URL`. |

No active runtime mode is silently chosen. Test-only defaults are isolated to `NODE_ENV=test`; development-only fallbacks are loopback/optional Redis behavior. `.env.example` makes empty secret and database values explicit so copying it without configuration fails fast.

### CORS, logging, errors, and secret boundaries

`src/main.ts` configures CORS from the validated allowlist, rejects wildcard configuration at validation, disables cookie credentials, and explicitly sets methods, allowed/exposed headers, and max age. The Nest logger is configured from the validated `LOG_LEVEL`; staging/production prohibit debug and verbose levels. The startup success line is an explicit allowlist of `event`, `environment`, `port`, and `log_level`, and does not serialize URLs, secrets, credentials, or the full environment object.

Startup validation runs before the server listens. Production startup failures emit a fixed redacted message; the exception filter returns a generic 5xx response, does not serialize stack traces, and writes no exception message to logs. The `.gitignore` excludes `.env` and `.env.*` while retaining the safe `.env.example`, and ignores key/credential directories and key file extensions. `.dockerignore` excludes environment files, `.npmrc`, credentials, private keys, local dependencies and generated files while explicitly retaining `.env.example`. The only tracked environment file observed was `.env.example`; its secret/database fields are blank.

## Failure-first startup verification

The compiled `dist/main.js` was run with a controlled, non-secret fixture environment. All three failures exited `1` as expected, without a stack trace or echoed configuration values:

```text
=== missing DATABASE_URL startup check ===
Startup configuration error: DATABASE_URL is required.
exit=1
=== invalid NODE_ENV=prod startup check ===
Startup configuration error: NODE_ENV must be one of development, staging, production, or test.
exit=1
=== production startup redaction check ===
Startup failed; sensitive details redacted.
exit=1
```

The active API was not brought up because PostgreSQL was unreachable; no live HTTP behavior or successful startup log line is claimed.

## Exact verification outputs

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

Exit code: `0` (six warnings; lint passed).

### Nest build

Command: `node ./node_modules/@nestjs/cli/bin/nest.js build`

Output: no stdout/stderr. Exit code: `0`.

### Configuration and exception-filter tests

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/app.module.spec.ts src/common/http-exception.filter.spec.ts --runInBand`

```text
(node:19232) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       13 passed, 13 total
Snapshots:   0 total
Time:        7.915 s
Ran all test suites matching src/app.module.spec.ts|src/common/http-exception.filter.spec.ts.
```

Exit code: `0`.

### Requested mocked team suites

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand`

```text
(node:5220) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        5.931 s
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
Client version: 29.9.2
Context: desktop-linux
Server:
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Exit code: `1`. Live Docker build, run, and health checks are **NOT EXECUTED**.

### PostgreSQL reachability

Command: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet`

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Live PostgreSQL/HTTP checks are **NOT EXECUTED**.
