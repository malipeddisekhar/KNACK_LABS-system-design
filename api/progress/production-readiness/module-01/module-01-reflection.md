# Production Readiness — Module 01 REFLECT

## What I learned

The multi-stage Node 20 slim image keeps build-time tooling out of the runtime stage, and pruning development dependencies reduces what ships with the service. A non-root runtime user reduces the impact of a compromised process; a focused ignore file also keeps local environments, credentials, tests, caches, and progress artifacts out of the build context. The container health check must match a route the app actually serves: this API has GET /health, and that endpoint returns { ok: true }.

These checks establish different things. A successful Nest build confirms the application compiles in the local workspace, not that a Docker image builds or starts. A health endpoint returning success shows the process can answer that route, but the current endpoint does not check PostgreSQL or Redis readiness. Therefore Docker health and live database/HTTP behavior remain NOT EXECUTED until the engine and local services are accessible.

## Quality self-assessment

The ratings below assess the work and evidence captured in this module; they do not claim the container has passed a live image run.

| Dimension | Rating | Evidence |
|---|---:|---|
| Prompt Quality | 5/5 | The work followed the Debian slim and multi-stage choices, preserved package/schema boundaries, and recorded actual environment limits. |
| Review Thoroughness | 5/5 | The review checked stage boundaries, dependency pruning, runtime user, health route, context exclusions, and clean-CI / secret risks. |
| Iteration Efficiency | 5/5 | The existing Dockerfile already had the main runtime guardrails, so the fix focused on the remaining build-context exposures instead of rewriting working pieces. |
| Judgment | 5/5 | Live checks were not inferred from static inspection; Docker permission denial and PostgreSQL False are clearly recorded. |
| Final Quality | 5/5 | The artifacts distinguish local compile evidence from image/runtime evidence and name concrete remaining verification steps. |

## Process and time efficiency

The module used a focused inspect, refine, and verify sequence. The initial container structure already had builder/runtime separation, production dependency pruning, a non-root user, and a health probe aligned to /health; the FIX pass strengthened .dockerignore to exclude nested environment files, credentials, private keys, and progress artifacts. Exact time spent, number of prompts, and a manual-build baseline were not measured, so no numeric time-saving claim is made.

This scoped approach saved effort by allowing the available local build to verify TypeScript/Nest compilation while preserving the explicit blocker around Docker Engine. It did not replace the pending Docker image build, runtime health observation, image-size measurement, or guarded database integration check.

## Decision Callback — Option B: Production-Grade

I would still choose the production-grade strategy for a service container intended to be operated by another team. It made image boundaries, user privileges, health behavior, secret handling, and verification limits explicit. The trade-off is that static files and a local compile are only an initial gate; the image still needs a real build and runtime check before release.

## Comprehension answers

1. **Why use multiple stages?** Build tools and development packages are useful while compiling, but the running service needs only compiled output and production dependencies, so separate stages keep build-only components out of the runtime image.
2. **What does a non-root user and ignore file protect?** The non-root user limits what the app process can change after compromise; the ignore file prevents unnecessary local files and common credentials from entering the build context.
3. **What does a health check prove?** It reports whether the configured probe can get a successful response from the running container. It does not prove dependencies are healthy unless the probe checks them, and Docker daemon access is needed to observe the actual container health state.

## Mini Practical — Reproducible verification

Nest build:

    node ./node_modules/@nestjs/cli/bin/nest.js build

    <no stdout or stderr; exit code 0>

Diff check:

    git diff --check

    warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
    <exit code 0>

Docker daemon:

    docker info

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
    <exit code 1>

    Docker image build, run, health, and size checks: NOT EXECUTED.

PostgreSQL reachability:

    Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False
    <exit code 0>

Live PostgreSQL/HTTP checks: NOT EXECUTED.

Risk: Treating the successful Nest build as evidence that the production image works could hide a missing pruned runtime dependency or an invalid runtime assumption. Mitigation: build and run the image once Docker Engine access is restored, confirm the effective user and healthy status, and validate database/HTTP behavior only against the guarded url_shortener_test environment.
