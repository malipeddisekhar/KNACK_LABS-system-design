# Production Readiness — Module 01 BREAK: Container Failure Analysis

## Scope and inspection

Inspected Dockerfile, .dockerignore, and src/health.controller.ts. The Dockerfile has a builder and runtime stage, runs the runtime as appuser, prunes development dependencies, installs curl, and defines a curl -f health check for /health. The health controller registers GET /health and returns { ok: true }. These are static findings only: Docker Engine access was denied, so image construction and container behavior could not be exercised.

## Failure modes and current evidence

| Failure mode | What can happen | Current evidence and boundary |
|---|---|---|
| Missing or broken health probe | A process can stay running while the app cannot serve requests. Docker can mark a failing health check as unhealthy, but an unhealthy status alone does not restart the container. A wrong path, unavailable curl, wrong port, or an app that has not started can cause false unhealthy status. | A HEALTHCHECK exists, curl is installed, PORT defaults to 3000, and the path is /health. The path matches the health controller. Runtime health was NOT EXECUTED because Docker Engine access failed. |
| Liveness mistaken for readiness | A lightweight endpoint may return healthy while required dependencies are unavailable, leaving traffic routed to an instance that cannot serve business requests. | The controller returns { ok: true } without dependency checks. It is suitable as a process liveness signal, but this inspection does not establish database or Redis readiness. |
| Overly broad build context | Local dependencies, tests, generated artifacts, caches, or secrets can increase transfer/build time and may accidentally enter layers or caches. A missing or incomplete ignore file can expose local environment data. | .dockerignore excludes Git metadata, node_modules, .env patterns, tests, coverage, build/cache artifacts, logs, Markdown, and OS/editor files; it explicitly retains .env.example. Other secret naming patterns (for example, an unignored credentials file) are not globally excluded, so the context still needs review when new secret files are introduced. |
| Root process | A compromised service may gain broader container privileges and have a larger impact on mounted files or accessible processes. | The runtime creates appgroup/appuser and switches to USER appuser. This reduces process privileges; Docker runtime inspection was NOT EXECUTED. |
| Pruned runtime dependencies | If an imported package is incorrectly classified as a development dependency, npm prune --omit=dev can remove it and the built app can fail during startup or when that path is first used. | The builder installs from package-lock.json, builds, and prunes before copying node_modules to runtime. Nest build succeeded locally, but this does not prove all runtime imports survive pruning. Image build/startup checks were NOT EXECUTED. |
| Missing runtime files | A build may rely on templates, generated clients, certificates, or other files that are not copied into the final stage, causing startup or request-time failures. | Runtime copies only node_modules, dist/, and package.json as specified. The Nest build passed locally, but the container image could not be built to verify the runtime file boundary. |
| Base image/platform mismatch | A native module or generated binary built on a different OS/libc/architecture may fail in the runtime image. | Both stages use node:20-slim, which keeps the build/runtime OS family consistent. Docker build and runtime checks were NOT EXECUTED. |

## Exact verification outputs

### Application build

Command:

    node ./node_modules/@nestjs/cli/bin/nest.js build

Output: no stdout or stderr.
Exit code: 0.

### Whitespace check

Command:

    git diff --check

Exit code: 0. Exact output:

    warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it

These line-ending warnings were not whitespace errors.

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
        Version:  v0.7.35
        Path:     C:\Users\malip\.docker\cli-plugins\docker-pass.exe
      sandbox: "docker sandbox" is deprecated, use Docker Sandboxes instead (Docker Inc.)
        Version:  v0.13.0
        Path:     C:\Users\malip\.docker\cli-plugins\docker-sandbox.exe
      scout: Docker Scout (Docker Inc.)
        Version:  v1.27.0
        Path:     C:\Users\malip\.docker\cli-plugins\docker-scout.exe

    Server:
    permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine

The CLI is installed, but this process cannot access the Docker Engine named pipe. This does not distinguish a stopped daemon from a permissions restriction.

NOT EXECUTED: docker build, container run, health-state verification, and image-size checks.

### PostgreSQL

Command:

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

Exact output:

    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

Exit code: 0. Live PostgreSQL and HTTP checks remain NOT EXECUTED.

## Conclusion

Static inspection shows several sensible safeguards and one notable readiness distinction: /health reports that the process responds, not that PostgreSQL or Redis are ready. No live Docker or database behavior is asserted. Once Docker Engine access is available, build the image, inspect its size and effective user, run it with test-only configuration, and verify health transitions; separately run any DB/HTTP check only against the guarded test environment.

