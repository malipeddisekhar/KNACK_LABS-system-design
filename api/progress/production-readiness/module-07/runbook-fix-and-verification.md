# Module 07 STEP 6: FIX — Runbook Fix and Verification

**Date:** 2026-11-24  
**Module:** 07 — Runbooks & Operational Docs  
**Step:** FIX  
**Decisions Carried Forward:** `decisions.module_07.runbook_format = checklist`, `decisions.module_06.circuit_breaker_approach = library`, `decisions.module_06.timeout_strategy = aggressive`, `decisions.module_05.failure_stance = fail_closed`

---

## 1. Exact Divergence in Runbook 1 Diagnosis

### The Stale Assumption
In `progress/production-readiness/module-07/runbooks.md`, **Runbook 1 (Database connection failure / pool exhaustion)** previously started directly with TCP and curl checks, followed by a read-only database query:
```powershell
node --input-type=module -e 'import "dotenv/config"; import pg from "pg"; const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ... }); ...'
```

### The Root-Cause of Failure Under Config Drift
When an environment variable name drifts or is renamed—such as changing `DATABASE_URL` to `DB_CONNECTION_STRING` or removing it from `.env` or deployment orchestration:
1. `process.env.DATABASE_URL` resolves to `undefined`.
2. `pg.Client({ connectionString: undefined })` falls back to default socket or localhost parameters.
3. The client fails to connect and throws a driver connection error (`ECONNREFUSED` or connection timeout).
4. An on-call responder following the runbook misinterprets this as a dead PostgreSQL database server, a network partition, or a port block, and proceeds to restart database services or containers when the database is completely healthy.

---

## 2. The Documentation Fix

### Step 1 Pre-Flight Environment Guard Added to Runbook 1
Runbook 1 Diagnosis was updated to insert an explicit CWD + secret-free environment key-name pre-flight check as **Step 1** before any network or database probe:

```powershell
node --input-type=module -e "import 'dotenv/config'; const keys = Object.keys(process.env).filter(k => /(DATABASE|DB_|POSTGRES|PG)/i.test(k)).sort(); console.log(JSON.stringify({ cwd: process.cwd(), has_DATABASE_URL: Object.prototype.hasOwnProperty.call(process.env, 'DATABASE_URL') && Boolean(process.env.DATABASE_URL), matching_keys: keys }));"
```

### Expected Outputs Documented:
- **Canonical / Healthy Configuration:**
  `{"cwd":"D:\\KNACK SEKHAR LAB\\upsk-system-design-workspace\\api","has_DATABASE_URL":true,"matching_keys":["DATABASE_URL","TEST_DATABASE_URL"]}`
- **Config Drift / Renamed Variable:**
  `{"cwd":"...","has_DATABASE_URL":false,"matching_keys":["DB_CONNECTION_STRING"]}`

### Runbook Guard Action:
If `has_DATABASE_URL` is `false`, the runbook instructs the responder to **STOP immediately**. Responders must not attempt database queries or container restarts. If `matching_keys` displays an alias like `DB_CONNECTION_STRING`, responders escalate the configuration drift or restore `DATABASE_URL` as required by the application contract before continuing.

### Safe Live Process Environment Inspection:
The runbook also documents how to safely verify live process environment key names without dumping secrets:
- Windows PowerShell:
  `Get-CimInstance Win32_Process -Filter "Name = 'node.exe'" | Select-Object ProcessId, CommandLine`
- Linux / Container:
  `cat /proc/$PID/environ | tr '\0' '\n' | cut -d= -f1 | grep -E 'DATABASE|DB_|POSTGRES|PG'`

---

## 3. Re-Simulation in an Isolated Environment

The renamed-variable drift scenario was re-simulated in an isolated temporary directory (`upsk-drift-sim-...`) using a dummy `.env` with `DB_CONNECTION_STRING=postgresql://...` and no `DATABASE_URL`:

### Pre-Flight Guard Output in Drifted Environment:
```json
{"cwd":"C:\\Users\\...\\AppData\\Local\\Temp\\upsk-drift-sim-...","has_DATABASE_URL":false,"matching_keys":["DB_CONNECTION_STRING"]}
```

### Un-Guarded Execution (Prior Runbook Behavior):
```json
{"database_url_type":"undefined","is_undefined":true,"has_DB_CONNECTION_STRING":true}
```

### Walkthrough of Updated Runbook 1:
1. **Step 1 (Pre-Flight Guard):** Returns `has_DATABASE_URL: false` and lists `matching_keys: ["DB_CONNECTION_STRING"]`. Zero secret values printed.
2. **Halt Condition:** The responder identifies that `DATABASE_URL` was renamed to `DB_CONNECTION_STRING`.
3. **Prevention:** Step 5 (the Node.js session query) is never executed with `undefined`, preventing false `ECONNREFUSED` diagnosis and avoiding dangerous container/service restarts.
4. **Resolution:** The configuration drift is corrected to match the canonical application contract.

---

## 4. Verification Suite Results (Executed in One Pass)

### 4.1 Startup Fail-Fast Checks
- **Missing `DATABASE_URL`:**
  `EnvironmentConfigurationError: DATABASE_URL is required.` (exits 1, names variable, no secrets)
- **Invalid `NODE_ENV=prod`:**
  `EnvironmentConfigurationError: NODE_ENV must be one of development, staging, production, or test.` (exits 1, lists valid modes, no secrets)
- **Production Startup Redaction:**
  Emits `{"level":"error","message":"Startup failed; sensitive details redacted.","service_name":"url-shortener-api","request_id":null}` with no stack trace and no secrets.

### 4.2 Lint
```text
& 'C:\Program Files\nodejs\npm.cmd' run lint
> oxlint --type-aware src/ test/
Found 6 warnings and 0 errors.
LINT_EXIT=0
```

### 4.3 Build
```text
node ./node_modules/@nestjs/cli/bin/nest.js build
BUILD_EXIT=0
```

### 4.4 Jest Suites (13 suites / 78 tests across 5 groups)
```text
Group 1 (app.module, http-exception.filter): 2 suites passed, 16 tests passed (exit 0)
Group 2 (team-activity-feed, team-collaboration-contracts): 2 suites passed, 22 tests passed (exit 0)
Group 3 (metrics.service, http-metrics.middleware, app-logger.service, request-id.middleware): 4 suites passed, 13 tests passed (exit 0)
Group 4 (analytics.service, ready.controller): 2 suites passed, 16 tests passed (exit 0)
Group 5 (resilience, bull-config, cache.service): 3 suites passed, 11 tests passed (exit 0)
TOTAL: 13 suites passed, 78 tests passed (exit 0)
```

### 4.5 Git Diff Check
```text
git diff --check
DIFF_CHECK_EXIT=0
```
(No whitespace or patch conflicts; workspace `.env`, `package.json`, and `prisma/` untouched).

### 4.6 Infrastructure Probes & NOT EXECUTED Boundaries
- **Docker Info:** `DOCKER_INFO_EXIT=0` (Docker Desktop Linux engine active, 0 running containers). Live Docker container checks (`docker logs`, `docker stats`, `docker restart`) remain **NOT EXECUTED** because no application container is running.
- **PostgreSQL TCP Port 5432:**
  `WARNING: TCP connect to (127.0.0.1 : 5432) failed` -> `False`.
  Live PostgreSQL queries and live HTTP endpoints (`/health`, `/ready`, `/metrics`) remain **NOT EXECUTED** because port 5432 is down and the API service is not listening.
