# Production Readiness — Module 01 FIX: Container Hardening

## Refinements applied

The review found that the Dockerfile already had the key runtime guardrails: Node 20 slim builder/runtime stages, npm ci, production pruning, only node_modules/dist/package.json copied to runtime, a curl health check targeting the implemented /health route, and USER appuser after creating appgroup/appuser. No Dockerfile change was needed for those findings; changing the probe or user would have regressed the existing verified alignment.

I strengthened .dockerignore to reduce secret leakage and unnecessary build context. It now excludes root and nested .env* files while explicitly restoring .env.example, npmrc files, cloud/SSH credential directories, secrets and credentials folders, common private key/certificate files, progress artifacts, and existing tests, caches, logs, build products, documentation, and OS/editor files. package-lock.json, source, Prisma build inputs, and package manifests remain available to the builder. No prisma/ or package.json files were changed.

## Failure modes and guardrails

| Failure mode | Guardrail | Remaining verification limit |
|---|---|---|
| Local secrets enter build context | .env* patterns plus exceptions retain only .env.example; npmrc, credential folders, cloud/SSH directories, and common private key files are excluded. | The safe content of .env.example is not certified by the ignore rule; keep it free of real credentials. Future secret file formats must be added to the deny list. |
| Tests, docs, caches, or local outputs bloat context | .dockerignore omits tests, progress, Markdown, node_modules, dist/build, coverage, caches, and logs. | Docker Engine access denied, so actual context transfer size was not measured. |
| Root process increases compromise impact | Runtime stage creates appgroup/appuser and switches to USER appuser. | Effective container UID was not inspected because no image could be built or run. |
| Wrong/missing health path causes false unhealthy state | curl is installed and HEALTHCHECK targets /health, which matches GET /health in src/health.controller.ts. | Health state was NOT EXECUTED because Docker Engine access was denied. |
| Liveness looks healthy while dependencies fail | /health is treated only as process liveness; readiness/dependency health must use a separate readiness signal if orchestration needs it. | No live dependency or orchestrator probe was run. |
| Pruning removes a runtime dependency | Builder installs from lockfile, compiles, then prunes dev dependencies before copying runtime dependencies. | Docker image build/startup was NOT EXECUTED; local Nest compilation alone does not validate the pruned runtime image. |

## Verification outputs

### Nest build

Command: node ./node_modules/@nestjs/cli/bin/nest.js build

Output: no stdout or stderr.
Exit code: 0.

### Diff check

Command: git diff --check

Exit code: 0. Exact output:

    warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it

These are line-ending warnings, not whitespace failures.

### Docker daemon

Command: docker info
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
      init: Manages a Docker project with the Docker init command (Docker Inc.)
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

The client is available, but this process cannot access the Docker Engine named pipe. This does not establish whether Docker Desktop is stopped or access is blocked by permissions.

NOT EXECUTED: docker build, container run, health-state verification, and image-size checks.

### PostgreSQL

Command: Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

Exact output:

    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

Exit code: 0. Live PostgreSQL and HTTP checks remain NOT EXECUTED.

## Result

The build-context secret exclusions are stronger, while the Dockerfile’s existing non-root execution, production-only runtime dependency copy, and /health alignment remain intact. Full container validation remains pending because Docker Engine access was denied; do not interpret the successful local Nest build as a Docker image or runtime pass.


