# Production Readiness — Module 02 BREAK: CI/CD Failure Analysis

## Scope

Reviewed the repository-root .github/workflows/ci.yml, api/Dockerfile, api/.dockerignore, and ci-pipeline-build-notes.md. The workflow is sequential and has several protective gates, but static review and local checks do not establish that GitHub Actions, Docker image construction, registry authentication, or live dependency behavior works end to end.

## CI/CD failure modes

| Failure mode | How it can break a build or release | Evidence / current mitigation / remaining limit |
|---|---|---|
| A failed quality stage must not reach Docker or push | If a later stage runs with an unconditional always() condition or the job ignores a nonzero result, a broken or untested image could be published. | The current lint, build, test, and diff checks are separate steps in one job and do not override the default success() gate. Docker build follows those steps; registry login/push follow build and size validation. The workflow_dispatch fail-fast drill intentionally exits before Docker, but it was not run on GitHub. |
| Push-only trigger misses pre-merge defects | A commit can merge before CI runs; main-only push CI detects the problem after it has reached the protected branch. | Workflow triggers on push to main and has no pull_request trigger. This meets the selected trigger but is a release-process limitation; branch protection must require the resulting check or a PR trigger should be added if pre-merge gating is required. |
| Workflow dispatch or test failures | A broken workflow may be discovered only after a real push; optional manual drill can be forgotten. | YAML parses successfully. No GitHub Actions run was available. The simulate_failure input can test downstream skip behavior, but the drill result is NOT EXECUTED. |
| Timeout too short or absent | A stuck dependency install/build can consume runner minutes; too-low limit can fail legitimate cold builds. | timeout-minutes is 15, preventing indefinite jobs. The 15-minute budget was not exercised on a clean Ubuntu runner; cold npm ci plus build and image construction could exceed it and should be monitored. |
| Cache misses or stale dependency assumptions | Without a useful key, clean installs become slow; unsafe cache reuse can carry incompatible artifacts. | actions/setup-node@v4 caches npm using api/package-lock.json. Lock changes invalidate the relevant cache. No GitHub runner cache behavior was executed here. |
| Lint warnings mistaken for blocking failures | A successful lint exit can leave important warnings unaddressed; conversely, launcher failure can be misread as code failure. | npm.cmd lint exits 0 with six unbound-method warnings. The plain PowerShell npm shim exits 1 because it cannot resolve npm-prefix.js; CI on Ubuntu uses its npm installation, so the local shim failure is not evidence of CI lint failure. |
| Mutable or untraceable tags | Reusing latest can make it unclear which source produced a deployed image and can make rollback select the wrong artifact. | The workflow uses the Git commit SHA for local and registry tags and does not use latest. A SHA tag can still be overwritten by registry policy; record the pushed digest for immutable release identity. |
| Image bloat | Unexpected build context or runtime dependencies increase pull time, storage, and attack surface. | .dockerignore excludes local dependencies, tests, docs, progress, caches, environment files, credential folders, private key files, and OS/editor artifacts. The Dockerfile prunes dev dependencies and copies only runtime dependencies, dist, and package.json. A 512 MiB uncompressed-size gate is defined. Docker build and size measurement are NOT EXECUTED, so no actual image size is claimed. |
| Runtime files/dependencies missing after pruning | npm prune --omit=dev can remove a package incorrectly listed as a development dependency; the image may build but fail when the omitted module is loaded. | The Nest build passed in the local workspace, but the production-pruned image was not built or started. This failure mode remains unverified until Docker Engine access returns. |
| Secrets exposed through context or logs | Credentials in environment files or shell output can enter image layers, build logs, or repository history. | .dockerignore excludes .env*, .npmrc, credential directories, and common private key files, while retaining .env.example. Registry credentials are GitHub secrets passed to docker/login-action@v3; the workflow never echoes them. No credentials were read locally. Do not put real credentials in YAML: history, forks, and logs can retain them after a later deletion. |
| Registry configuration error | Missing namespace or invalid credentials can prevent publication after all tests pass. | REGISTRY_NAMESPACE is a required non-secret repository variable checked before login; username/password are secrets. Registry login and push are restricted to push on refs/heads/main. No namespace or credentials were available/used, and registry actions are NOT EXECUTED. |
| Private npm registry configuration omitted from Docker context | The image build stage runs npm ci, but .dockerignore excludes .npmrc; a future private dependency can make image builds fail or tempt maintainers to copy auth config into the build context. | Current dependencies were installed locally, but Docker image build is NOT EXECUTED. For private packages, inject a short-lived npm config/token with a BuildKit secret mount rather than copying .npmrc or hardcoding credentials. |
| Clean-CI database and seed assumptions | Mock tests can pass on an empty runner while a DB-backed integration suite fails because expected users or seed rows do not exist. | The workflow runs only the two mocked suites and provisions no Postgres/Redis services. teams.collaboration.spec.ts logs in using pre-seeded Alice/Bob accounts and does not create them; a clean DB may fail before the test scenario. That E2E path is not part of this pipeline and must gain test-owned fixtures before becoming a required clean-CI gate. |
| Health check mistaken for dependency readiness | A container may answer /health while Postgres or Redis is down; orchestration could treat it as ready for business traffic. | Dockerfile's /health check matches the controller but is only a liveness response. This workflow does not run a container or probe /ready; container health and live dependency readiness are NOT EXECUTED. |

## Exact verification outputs

### YAML parse

Command:

    node ./node_modules/prettier/bin/prettier.cjs --parser yaml ..\.github\workflows\ci.yml | Out-Null; Write-Output "YAML parse exit: $LASTEXITCODE"

Output:

    YAML parse exit: 0

Process exit code: 0.

### Direct PowerShell npm shim

Command:

    npm run lint

Exit code: 1. Exact output:

    node:internal/modules/cjs/loader:1607
      throw err;
      ^

    Error: Cannot find module 'C:\Program Files\nodejs\node_modules\npm\bin\node_modules\npm\bin\npm-prefix.js'
        at Module._resolveFilename (node:internal/modules/cjs/loader:1603:15)
        at wrapResolveFilename (node:internal/modules/cjs/loader:1603:15)
        at defaultResolveImplForCJSLoading (node:internal/modules/cjs/loader:1169:37)
        at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1196:12)
        at Module._load (node:internal/modules/cjs/loader:1370:27)
        at wrapModuleLoad (node:internal/modules/cjs/loader:261:19)
        at Function.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
        at node:internal/main/run_main_module:36:49 {
      code: 'MODULE_NOT_FOUND',
      requireStack: []
    }

    Node.js v26.13.0
    Could not determine Node.js install directory

This failure is the PowerShell npm wrapper, not the lint process itself.

### npm.cmd lint

Command:

    C:\Program Files\nodejs\npm.cmd run lint

Exit code: 0. Exact output:

    > api@0.0.1 lint
    > oxlint --type-aware src/ test/

    src/teams/team-collaboration-contracts.spec.ts:116:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:166:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:217:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:261:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:277:71: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:309:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.

### Nest build

Command:

    node ./node_modules/@nestjs/cli/bin/nest.js build

Output: no stdout or stderr.
Exit code: 0.

### Focused mocked team tests

Command:

    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

Exact output:

    (node:11424) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use node --trace-warnings ... to show where the warning was created)

    Test Suites: 2 passed, 2 total
    Tests:       22 passed, 22 total
    Snapshots:   0 total
    Time:        18.898 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.

Exit code: 0.

### Diff check

Command:

    git diff --check

Exit code: 0. Exact output:

    warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
    warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it

### Docker daemon

Command:

    docker info

Exit code: 1. Exact output:

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
      dhi: CLI for managing Docker Hardened Images (Docker Inc.)
        Version:  v0.0.9
        Path:     C:\Users\malip\.docker\cli-plugins\docker-dhi.exe
      extension: Manages Docker extensions (Docker Inc.)
        Version:  v0.2.32
        Path:     C:\Users\malip\.docker\cli-plugins\docker-extension.exe
      init: Creates Docker-related starter files for your project (Docker Inc.)
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
      pass: Docker Pass Secrets Manager Plugin (beta) (Docker Inc.)
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

NOT EXECUTED: Docker build, image size verification, container health, registry login, and registry push. No credential values were read.

### PostgreSQL reachability

Command:

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

Exact output:

    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

Exit code: 0. Live PostgreSQL/HTTP checks remain NOT EXECUTED.

No prisma/ or package.json files were modified in this BREAK review.

