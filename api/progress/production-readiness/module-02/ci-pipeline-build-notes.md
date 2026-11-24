# Production Readiness — Module 02 BUILD: CI Pipeline Notes

## Workflow location and pipeline shape

The Git repository root is D:/KNACK SEKHAR LAB/upsk-system-design-workspace; the API project is in its api/ subdirectory. Therefore the discoverable GitHub Actions file is .github/workflows/ci.yml at repository root, with pipeline commands running in api/.

The workflow uses ubuntu-latest, a 15-minute job timeout, a push trigger on main, and an optional manual workflow_dispatch fail-fast drill. It checks out with actions/checkout@v4, sets up Node 20 with actions/setup-node@v4 and npm cache keyed from api/package-lock.json, and performs npm ci. Lint, Nest build, focused unit/contract tests, and git diff --check run as ordered steps in one job; GitHub's default success condition skips all later steps after a failure.

## Chunk 1 — Sequential clean checks

The checks run in this order: npm ci; npm run lint; npm run build; the focused activity-feed and collaboration-contract Jest suites; git diff --check. The Docker stage occurs only after these pass. The local PowerShell npm shim failed when invoking npm run lint directly, but invoking the same script through npm.cmd succeeded; the GitHub ubuntu runner uses the normal npm environment. This workflow runs the two mocked team suites, not the PostgreSQL-backed teams.collaboration.spec.ts; it does not provision PostgreSQL/Redis or claim database integration coverage. Module 08 identified that DB-backed spec's pre-seeded Alice/Bob assumption as a clean-CI risk, so that test needs test-owned fixture setup before being added as a required gate.

The optional workflow_dispatch input simulate_failure intentionally exits nonzero immediately before Docker build. A manually requested drill should show the Docker build and all following steps as skipped. This drill was not run on GitHub in this task.

## Chunk 2 — SHA-tagged Docker build and size gate

Docker builds the API context as local/upsk-system-design-api:<GITHUB_SHA>. This ties an artifact to the checked-out commit and makes deployments and rollbacks easier to trace than a mutable latest tag. A commit SHA is traceable but a registry tag can still be overwritten if registry policy permits it; production release records should also retain the registry digest.

The workflow checks the image's uncompressed Docker image size and fails when it exceeds 512 MiB (536870912 bytes). This uses docker image inspect and does not print credentials.

## Chunk 3 — Registry push and local fallback

Registry login uses docker/login-action@v3 against Docker Hub with GitHub secrets REGISTRY_USERNAME and REGISTRY_PASSWORD. The namespace is supplied as the non-secret repository variable REGISTRY_NAMESPACE. Set that variable to the Docker Hub account or organization. Tag and push steps require both a push event and refs/heads/main; manual drill runs and other refs do not push. The final log prints only the image tag, never credential values.

Hardcoded real credentials in workflow YAML are unsafe because repository readers, logs, forks, or later Git history may expose them; deleting a value from the current file does not remove it from prior commits. Store registry credentials as masked GitHub secrets and use short-lived/scoped tokens where available. The workflow contains no registry credential literals.

When the local Docker Engine is unavailable, retain the Nest build, lint/test output, and diff evidence as local fallback artifacts, but do not label them as a Docker image. Once Docker access is available, local fallback commands are:

    docker build -t local/upsk-system-design-api:<commit-sha> .
    docker image inspect local/upsk-system-design-api:<commit-sha> --format '{{.Size}}'
    docker save local/upsk-system-design-api:<commit-sha> -o upsk-system-design-api-<commit-sha>.tar

The saved tar can be attached to a release record if needed; no Docker image or tar was produced in this environment.

## Chunk 4 — Timeout, cache, size gate, and fail-fast behavior

The workflow caps the job at 15 minutes. setup-node's npm cache uses api/package-lock.json as its dependency key input, so lockfile changes invalidate the appropriate cache. The 512 MiB limit is enforced after build and before registry credentials are loaded. Separate sequential run steps stop at the first nonzero result; the manual failure drill is placed before Docker build to demonstrate that gate without altering the source tests.

## Local verification results

### Lint/static check

Command: npm run lint

Exit code: 1. Exact PowerShell launcher error:

    node:internal/modules/cjs/loader:1607
      throw err;
      ^

    Error: Cannot find module 'C:\Program Files\nodejs\node_modules\npm\bin\node_modules\npm\bin\npm-prefix.js'
        at Module._resolveFilename (node:internal/modules/cjs/loader:1603:15)
        at wrapResolveFilename (node:internal/modules/cjs/loader:1145:27)
        at defaultResolveImplForCJSLoading (node:internal/modules/cjs/loader:1176:37)
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

Command: C:\Program Files\nodejs\npm.cmd run lint

Output:

    11.20.0

    > api@0.0.1 lint
    > oxlint --type-aware src/ test/

    src/teams/team-collaboration-contracts.spec.ts:116:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:166:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:217:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:261:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:277:71: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.
    src/teams/team-collaboration-contracts.spec.ts:309:17: warning typescript(unbound-method): Avoid referencing unbound methods which may cause unintentional scoping of this. help: If your function does not access this, you can annotate it with this: void, or consider using an arrow function instead.

Exit code: 0.

### Nest build

Command: node ./node_modules/@nestjs/cli/bin/nest.js build

Output: no stdout or stderr.
Exit code: 0.

### Unit and contract tests

Command: node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts src/teams/team-collaboration-contracts.spec.ts --runInBand

    (node:18828) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
    (Use node --trace-warnings ... to show where the warning was created)

    Test Suites: 2 passed, 2 total
    Tests:       22 passed, 22 total
    Snapshots:   0 total
    Time:        9.568 s
    Ran all test suites matching src/teams/team-activity-feed.spec.ts|src/teams/team-collaboration-contracts.spec.ts.

Exit code: 0.

### Diff check

Command: git diff --check

Exit code: 0. Exact warnings:

    warning: in the working copy of '.github/workflows/ci.yml', LF will be replaced by CRLF the next time Git touches it
    warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it

### Workflow YAML parse check

Command: node ./node_modules/prettier/bin/prettier.cjs --parser yaml ../.github/workflows/ci.yml

Output: no YAML parse error.
Exit code: 0.

### Docker daemon

Command: docker info
Exit code: 1. Exact server error:

    permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine

Docker CLI version was 29.9.2, context desktop-linux. The client could not access the Engine named pipe.

NOT EXECUTED: docker build, tag, save, image-size inspection, container run/health, registry login, and registry push. No credentials were read.

### PostgreSQL reachability

Command: Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

Exact output:

    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

Exit code: 0. Live PostgreSQL/HTTP checks remain NOT EXECUTED.

No package.json or prisma/ files were modified for this task.

