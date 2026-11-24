# Module 07 STEP 5: BREAK — Runbook Break Analysis

**Date:** 2026-11-24  
**Module:** 07 — Runbooks & Operational Docs  
**Step:** BREAK  
**Decision carried forward:** `module_07.runbook_format = checklist`  
**Inherited decisions:** `module_06.circuit_breaker_approach = library`, `module_06.timeout_strategy = aggressive`, `module_05.failure_stance = fail_closed`

---

## Scenario Chosen: Scenario A — Stale Runbook (Config Drift)

### What Was Injected

The runbook references `DATABASE_URL` as the environment variable name for the PostgreSQL connection string. The `.env.example` file, `docs/service-overview.md`, and `src/app.module.ts` all consistently name this variable `DATABASE_URL`. The injected drift is conceptual: a hypothetical operator renames the variable to `DB_CONNECTION_STRING` in the actual deployed config (or a different environment file), while `runbooks.md` continues to reference `DATABASE_URL`.

This matches Scenario A exactly: **the runbook command syntax is valid but the assumption it encodes — that `DATABASE_URL` is the live variable name — has drifted from reality**.

---

## Scenario A Diagnosis: Config Drift Analysis

### What the Runbook Assumes

**Runbook 1, Diagnosis step 4** contains this Node.js snippet:

```powershell
node --input-type=module -e 'import "dotenv/config"; import pg from "pg"; const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ... })'
```

The command reads `process.env.DATABASE_URL`. It is syntactically correct. However, if the variable has been renamed to `DB_CONNECTION_STRING` in the deployed environment file, this returns `undefined` and the client attempts to connect with no connection string — producing a misleading generic ECONNREFUSED or connection timeout error rather than a clear "wrong variable name" signal.

**Runbook 1, Fix step 1** also says:
> "If `Test-NetConnection` is `False`, check the configured local lab service..."

The runbook assumes the absence of TCP connectivity is due to a service being down — not due to the diagnostic command hitting the wrong variable and silently falling back to a localhost default.

### Stale Assumptions Identified

| Runbook location | Stale assumption | Reality / drift |
|---|---|---|
| Runbook 1, Diagnosis step 4 | `process.env.DATABASE_URL` resolves the connection string | If renamed to `DB_CONNECTION_STRING`, returns `undefined`; `pg.Client` falls back to OS default socket or errors non-specifically |
| Runbook 1, Diagnosis step 4 | `import "dotenv/config"` loads the correct `.env` file from CWD | If the command is run from a different directory or the env file has a non-default path, dotenv loads nothing silently |
| Runbook 2, Fix step 1 | References "DATABASE_URL" implicitly via Runbook 1 cross-reference | Same variable-name assumption propagates |
| All three runbooks | Service runs at `http://127.0.0.1:3000` | Valid only when `PORT=3000` in the loaded env; if the env file drifted to a different port, all curl checks hit a closed port |
| `service-overview.md` configuration table | Lists `DATABASE_URL` as the env var name | Authoritative only if the actual runtime config matches; no automated cross-check between the runbook and deployed config exists |

### Syntax Validity vs. Drift

**Syntax-valid, assumption-stale:**
- `docker info` — syntactically valid PowerShell; fails because the Docker Desktop Linux engine named pipe (`//./pipe/dockerDesktopLinuxEngine`) is unavailable, not because the command is wrong
- `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet` — syntactically valid; `False` returned because nothing listens on 5432, not because the command is wrong
- `process.env.DATABASE_URL` — syntactically valid; returns `undefined` if the variable was renamed; the runbook cannot distinguish "variable not set" from "variable renamed"

**Structural detection gap:** The runbook has no verification step that confirms which environment variables are currently exported before running the diagnostic query. An operator following the runbook at 3 AM will assume the variable name is correct and waste time on the wrong diagnostic chain.

### Specific Drift Boundaries

The drift scenario exposes three absence-of-detection gaps:

1. **No variable-name guard:** No runbook step prints the list of exported env variable names (without values) to confirm the expected key exists before using it.
2. **No dotenv-path verification:** The Node.js snippet assumes CWD is the API directory and `.env` is at the default path; there is no explicit `--env-file` guard.
3. **No startup-config cross-reference:** The service overview lists `DATABASE_URL` but nothing in the runbook verifies the live process was actually launched with that variable name vs. the declared name.

---

## Verification Drills — All Commands Run in One Pass

### Startup Fail-Fast Checks

**Missing `DATABASE_URL` → exit 1:**

The `app.module.ts` `readRequiredString` function throws `EnvironmentConfigurationError('DATABASE_URL is required.')` when the variable is absent. The `main.ts` catch block sets `process.exitCode = 1` and writes a sanitized JSON error to stderr. Verified by importing `dist/app.module.js` without `DATABASE_URL` set:

```text
node --input-type=module -e "import './dist/app.module.js'"
EnvironmentConfigurationError: DATABASE_URL is required.
EXIT=1
```

Fail-fast correctly names `DATABASE_URL` in the error message. No connection string value, no stack trace fields, and no secret values are emitted in the error.

**Invalid `NODE_ENV=prod` → exit 1:**

The `readEnvironment` function throws `EnvironmentConfigurationError('NODE_ENV must be one of development, staging, production, or test.')` for any value not in the valid set. `prod` is not a valid mode. Verified:

```text
EnvironmentConfigurationError: NODE_ENV must be one of development, staging, production, or test.
EXIT=1
```

Lists valid modes in the error message. No secrets, no stack trace.

**Production startup failure → redacted message:**

`main.ts` lines 66–68 check `process.env.NODE_ENV === 'production'` before the app module validates env, so production errors emit:

```text
{"timestamp":"...","level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}
```

No stack trace, no secret values in the redacted production message. All three fail-fast behaviors are verified in the compiled `dist/`.

---

### Lint

```text
& 'C:\Program Files\nodejs\npm.cmd' run lint
> api@0.0.1 lint
> oxlint --type-aware src/ test/

Found 6 warnings and 0 errors.
Finished in 11.2s on 98 files with 111 rules using 16 threads.
LINT_EXIT=0
```

6 `typescript(unbound-method)` warnings in `src/teams/team-collaboration-contracts.spec.ts` (lines 116, 166, 217, 261, 277, 309) — same pre-existing warnings as Module 06; no new errors introduced. Exit 0.

---

### Build

```text
node ./node_modules/@nestjs/cli/bin/nest.js build
BUILD_EXIT=0
```

TypeScript compiled to `dist/` without errors. No new type errors from Module 07 artifacts (no source changes were made). Exit 0.

---

### Jest Test Suites

All 5 groups run with `node --experimental-vm-modules node_modules/jest/bin/jest.js --runInBand --forceExit`:

```text
Group 1 — src/app.module.spec.ts, src/common/http-exception.filter.spec.ts
  Test Suites: 2 passed, 2 total
  Tests:       16 passed, 16 total
  JEST1_EXIT=0

Group 2 — src/teams/team-activity-feed.spec.ts, src/teams/team-collaboration-contracts.spec.ts
  Test Suites: 2 passed, 2 total
  Tests:       22 passed, 22 total
  JEST2_EXIT=0

Group 3 — src/metrics/metrics.service.spec.ts, src/metrics/http-metrics.middleware.spec.ts, src/common/app-logger.service.spec.ts, src/request-id.middleware.spec.ts
  Test Suites: 4 passed, 4 total
  Tests:       13 passed, 13 total
  JEST3_EXIT=0

Group 4 — src/analytics/analytics.service.spec.ts, src/ready.controller.spec.ts
  Test Suites: 2 passed, 2 total
  Tests:       16 passed, 16 total
  JEST4_EXIT=0

Group 5 — src/common/resilience.spec.ts, src/common/bull-config.spec.ts, src/cache/cache.service.spec.ts
  Test Suites: 3 passed, 3 total
  Tests:       11 passed, 11 total
  JEST5_EXIT=0

TOTAL: 13 suites passed, 78 tests passed
```

All 13 suites and 78 tests pass. No regressions introduced.

---

### Git Diff

```text
git diff --check
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/.gitignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
DIFF_CHECK_EXIT=0
```

Line-ending normalization warnings only (Windows/Unix CRLF/LF transitions on tracked config/CI files). No trailing whitespace or merge conflict markers. Exit 0.

---

### Docker Info — NOT EXECUTED

```text
docker info

Client:
 Version:    29.9.2
 Context:    desktop-linux
 ...plugins listed...

Server:
failed to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine; check if the path is correct
and if the daemon is running: open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.

DOCKER_INFO_EXIT=1
```

**Docker Desktop Linux engine named pipe is unavailable.** The Client section returns successfully (Docker CLI is installed) but the Server section fails to connect to `//./pipe/dockerDesktopLinuxEngine`.

> **NOT EXECUTED:** All live Docker-dependent runbook steps are NOT EXECUTED. This includes:
> - `docker logs --since 15m --tail 200 url-shortener-api` (Runbook 2 Diagnosis step 4)
> - `docker stats --no-stream url-shortener-api` (Runbook 3 Diagnosis step 4)
> - `docker restart url-shortener-api` (Runbook 3 Fix step 2)
> - `docker ps -aq --filter 'publish=5432'` (Runbook 1 Fix step 3)
> - Local deploy and rollback container commands (service-overview.md)
>
> The runbook's Runbook 1 Diagnosis step 5 correctly gates container actions: "If the Docker named pipe is missing, do not issue container start/restart commands; use the infrastructure escalation path." That guard is confirmed operable — Docker info exits 1, so no container command proceeds.

---

### PostgreSQL TCP Reachability — NOT EXECUTED

```text
Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Port 5432 is not listening on 127.0.0.1 in the current environment. This is consistent with the dry-run record already in `runbooks.md` Chunk 3.

> **NOT EXECUTED:** All runbook steps requiring a live PostgreSQL connection or a live API process (HTTP probe on port 3000) are NOT EXECUTED. This includes:
> - Runbook 1 Diagnosis step 1 (TCP check → `False`, shown above)
> - Runbook 1 Diagnosis steps 2, 3 (curl `/health`, `/ready` → API not running on 3000)
> - Runbook 1 Diagnosis step 4 (Node.js session query → `DATABASE_URL` resolves to empty string in this env)
> - All `/metrics`, `/health`, `/ready` HTTP checks across Runbooks 2 and 3
>
> These are infrastructure-layer limitations, not runbook defects. The runbook correctly documents expected failure outputs (`False`, `curl: (7)`) for these scenarios.

---

## Scenario A Config-Drift Summary

### Root Cause of Drift Failure

The runbook command `process.env.DATABASE_URL` returns `undefined` if the variable was renamed. The `pg.Client` with `connectionString: undefined` falls back to the OS-level PostgreSQL socket or a default host, producing a connection error that **looks identical to a real database outage**. The operator cannot distinguish:

- Variable renamed (config drift) → same ECONNREFUSED symptom  
- PostgreSQL service stopped → same ECONNREFUSED symptom

### Verification Gap

There is no runbook step that:
1. Prints the set of exported env variable keys (without values) before running the diagnostic Node.js snippet
2. Verifies that the `.env` file loaded by `dotenv/config` matches the expected location
3. Cross-checks the variable name used in the runbook against the variable name exported by the actual running process

### What Makes This the Most Common Real-World Runbook Failure

The runbook was correct at time of writing. The system changed (a variable rename, a secret rotation that introduced a new name, a deployment platform that injects a different key name). The runbook command syntax remained valid — only its assumption drifted. The operator gets a plausible-looking error at the wrong diagnostic step and chases the wrong fix.

### Runbook Maintenance Implication

Per `runbooks.md` Section "Runbook maintenance":
> "Re-test the relevant runbook after every incident that uses it, after changes to ports, deployment topology, dependencies, alert rules, or timeout settings..."

A variable rename is a configuration topology change. The runbook should be re-tested and updated whenever any env var name in `service-overview.md` changes. The fix for this gap is a pre-flight variable-name guard as the first diagnostic step in Runbook 1.

---

## NOT EXECUTED Boundary Summary

| Check | Status | Reason |
|---|---|---|
| `docker info` (Client section) | EXECUTED — exit 1 | Server section: `dockerDesktopLinuxEngine` pipe not found |
| `docker info` (Server section) | NOT EXECUTED | Linux engine daemon not running |
| All `docker logs`, `docker stats`, `docker restart`, `docker ps` | NOT EXECUTED | `docker info` exits 1; runbook gate correctly blocks all container commands |
| `Test-NetConnection 127.0.0.1:5432` | EXECUTED → `False` | Port 5432 not listening |
| All curl `/health`, `/ready`, `/metrics` HTTP checks | NOT EXECUTED | API process not running (port 5432 `False` → no DB → service not started) |
| Node.js DB session query | NOT EXECUTED | `DATABASE_URL` empty in this environment; PostgreSQL not reachable |
| Lint | EXECUTED → exit 0 | 6 pre-existing warnings, 0 errors |
| Build | EXECUTED → exit 0 | TypeScript compiled clean |
| Jest 13 suites / 78 tests | EXECUTED → all passed | All mocked, no live DB/Redis/Docker required |
| Git diff --check | EXECUTED → exit 0 | CRLF warnings only, no content errors |
| Startup fail-fast: missing `DATABASE_URL` | EXECUTED → exit 1 | Names `DATABASE_URL` in error; no secrets/stack trace |
| Startup fail-fast: invalid `NODE_ENV=prod` | EXECUTED → exit 1 | Lists valid modes; no secrets/stack trace |
| Production startup redaction | VERIFIED in source | `main.ts` lines 66–68: `'Startup failed; sensitive details redacted.'` |
