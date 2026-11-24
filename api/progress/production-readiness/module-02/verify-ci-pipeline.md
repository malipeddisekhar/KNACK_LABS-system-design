# Production Readiness — Module 02 VERIFY: CI Pipeline

## Workflow audit

The workflow is at the repository root at D:/KNACK SEKHAR LAB/upsk-system-design-workspace/.github/workflows/ci.yml, because that is the Git root and GitHub Actions discovery location. Its run commands use the api/ working directory.

The workflow has a 15-minute timeout, runs on ubuntu-latest, and triggers on push to main. It checks out with actions/checkout@v4, uses actions/setup-node@v4 with npm cache and api/package-lock.json as cache-dependency-path, then performs npm ci. Lint, build, focused mocked tests, and git diff --check are separate sequential steps; the Docker stage therefore runs only when preceding checks succeed. It tags the local image with GITHUB_SHA, enforces a 512 MiB limit, and gates Docker Hub namespace validation, login, tag, and push on a push event to refs/heads/main. Login uses REGISTRY_USERNAME and REGISTRY_PASSWORD GitHub secrets; the workflow contains no literal registry credentials. REGISTRY_NAMESPACE is a non-secret repository variable. A workflow_dispatch input can deliberately fail before Docker build to exercise the fail-fast gate; that drill was not run in GitHub.

The clean-CI boundary is explicit: the workflow runs the two mocked team suites and does not provision PostgreSQL or Redis or run teams.collaboration.spec.ts. That DB-backed spec has a pre-seeded Alice/Bob account assumption documented in Module 08; it needs test-owned setup before it is suitable as a clean-CI integration gate.

## Verification results

### YAML parse

Command:

    node ./node_modules/prettier/bin/prettier.cjs --parser yaml ..\.github\workflows\ci.yml | Out-Null; Write-Output "YAML parse exit: $LASTEXITCODE"

Output:

    YAML parse exit: 0

Command exit code: 0.

### Lint through the PowerShell npm shim

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

This is the PowerShell npm shim failure, not a lint result.

### Lint through npm.cmd

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

### Mocked team tests

Command:

    node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

Exact output:

    (node:2272) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use node --trace-warnings ... to show where the warning was created)

    Test Suites: 2 passed, 2 total
    Tests:       22 passed, 22 total
    Snapshots:   0 total
    Time:        7.138 s
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

NOT EXECUTED: Docker image build, image size, registry login/push, and container runtime checks. No registry credentials were read.

### PostgreSQL reachability

Command:

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

Exact output:

    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

Exit code: 0. Live PostgreSQL/HTTP checks remain NOT EXECUTED.

No prisma/ or package.json files were modified in this VERIFY task.

