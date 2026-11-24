# Production Readiness — Module 02 FIX: CI Hardening and Verification

## Scope and changes

Reviewed the repository-root `.github/workflows/ci.yml`, `api/Dockerfile`, `api/.dockerignore`, and the preceding `ci-break-analysis.md`. The workflow now runs on pushes and pull requests targeting `main`, as well as manual dispatch. The existing single job remains sequential: clean install, lint, build, mocked tests, whitespace check, optional failure drill, Docker build, size check, then (only for a successful push to `main`) registry validation, login, and push.

The optional failure drill and Docker build/size steps now explicitly require `success()`. Registry validation, login, and publication also require `success()` and the push-to-main event/ref. This keeps the drill's intentional failure and any failed quality gate from reaching image build or publication. The image retains the full `GITHUB_SHA` tag and the 512 MiB uncompressed-size limit. The only registry credentials referenced are `${{ secrets.REGISTRY_USERNAME }}` and `${{ secrets.REGISTRY_PASSWORD }}` in the login action; the YAML contains no literal credentials and does not print secrets. Registry namespace remains a non-secret repository variable.

No `.dockerignore` edit was needed: the existing rules exclude `.env*` while restoring `.env.example`, `.npmrc`, local credentials/private keys, dependencies, build/test output, caches, progress notes, documentation, and OS/editor artifacts. The Dockerfile remains multi-stage and prunes development dependencies before copying runtime artifacts.

## Failure modes addressed and remaining gates

| Finding from BREAK | Guardrail / current disposition |
|---|---|
| Failures could reach Docker or push | Sequential single job plus explicit `success()` conditions on Docker, size check, namespace validation, login, and push. The manual `simulate_failure` drill is available, but a GitHub Actions run of the drill was not performed here. |
| Push-only CI discovers issues after merge | Added `pull_request` for `main`; pushes to `main` still run and publish. Repository branch protection must require the PR check for it to block merges. |
| Mutable/untraceable `latest` tag | Workflow uses the commit SHA for the local and registry image tag; no `latest` tag is used. A registry can still permit overwriting a SHA tag, so release records should retain the pushed digest. |
| Image bloat or leaked build-context files | Existing `.dockerignore` excludes environment/credential files and bulky local artifacts. The workflow checks the built image against 512 MiB. Actual build/size measurement is **NOT EXECUTED** because Docker Engine access is denied. |
| Secret exposure | Registry credentials are GitHub secrets consumed by `docker/login-action@v3`; no credentials are hardcoded or echoed. A Docker login/push was **NOT EXECUTED**. |
| Clean-CI DB assumptions | Pipeline runs the two mocked team suites and does not provision PostgreSQL/Redis or run `teams.collaboration.spec.ts`. That DB-backed suite still relies on pre-seeded Alice/Bob accounts; test-owned fixtures and an isolated test database are required before adding it as a clean-CI gate. |
| Slow or stuck clean builds | `timeout-minutes: 15` and npm cache keyed through `api/package-lock.json` remain. Cold-run timing/cache behavior on GitHub-hosted Ubuntu is **NOT EXECUTED**. |

The workflow currently runs Docker build/size checks on a successful PR, but publishes only on a successful push to `main`. No deployed release, branch-protection setting, GitHub-hosted workflow run, Docker image, registry push, or live HTTP behavior is claimed by this local verification.

## Verification outputs

All commands below were run from `D:\KNACK SEKHAR LAB\upsk-system-design-workspace\api`, except the YAML parser targets the root workflow from that directory.

### YAML parse

Command:

```powershell
node ./node_modules/prettier/bin/prettier.cjs --parser yaml ..\.github\workflows\ci.yml | Out-Null
```

Output: no stdout/stderr; exit code `0`.

### Lint

Command:

```powershell
& 'C:\Program Files\nodejs\npm.cmd' run lint
```

Output:

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

Exit code: `0` (six existing warnings; lint passed).

### Nest build

Command: `node ./node_modules/@nestjs/cli/bin/nest.js build`

Output: no stdout/stderr; exit code `0`.

### Focused mocked tests

Command: `node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand`

Output:

```text
(node:19576) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        6.087 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.
```

Exit code: `0`.

### Diff whitespace

Command: `git diff --check`

Output:

```text
warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
```

Exit code: `0`; no whitespace errors were reported.

### Docker daemon

Command: `docker info`

The client identified Docker `29.9.2` in context `desktop-linux`; server access failed with this exact error:

```text
permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine
```

Exit code: `1`. Live Docker build, image-size inspection, container health, registry login, and registry push are **NOT EXECUTED**.

### PostgreSQL reachability

Command: `Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet`

Output:

```text
WARNING: TCP connect to (127.0.0.1 : 5432) failed
False
```

Live PostgreSQL/HTTP checks and DB-backed integration tests are **NOT EXECUTED**.
