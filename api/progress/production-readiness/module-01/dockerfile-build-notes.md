# Module 01 BUILD — Docker Image Notes

## Chunk 1 — Single-stage baseline vs. multi-stage

A single-stage image that installs all dependencies and builds in place normally carries the compiler, Nest/TypeScript tooling, test tooling, and development dependencies into the deployable image. The multi-stage design uses Node 20 Debian slim in both stages, builds with the complete dependency set, then prunes development dependencies before transferring runtime files; this reduces the shipped toolchain and attack surface. No image size was measured because Docker Engine access was denied, so no size reduction is claimed.

## Chunk 2 — Builder-to-runtime boundary

The builder stage works in /app, copies package.json and package-lock.json, runs npm ci, copies the build context, runs npm run build --if-present, then runs npm prune --omit=dev. The clean runtime stage starts again from node:20-slim, installs only runtime OS utilities (curl, CA certificates, and OpenSSL), and receives only pruned node_modules, compiled dist/, and package.json from the builder. The image exposes port 3000, starts node dist/main.js, and does not copy source, tests, local environment files, or documentation into the runtime stage.

The repository includes package-lock.json, satisfying the npm ci lockfile requirement. Prisma files remain in the build context so build-time generation or compilation dependencies are not accidentally removed; the runtime stage copies only the requested three artifact groups.

## Chunk 3 — Non-root runtime, context savings, health check

The runtime process uses the system group appgroup and system user appuser, reducing the impact of a compromised application process compared with running as root. .dockerignore excludes Git metadata, local dependencies, .env and other environment files while retaining .env.example but excluding Markdown, tests, coverage/build/cache outputs, logs, and common OS/editor artifacts. This avoids sending local secrets and unnecessary files to the daemon and keeps runtime needs such as package.json, package-lock.json, source/build inputs, Prisma files, and dependency manifests available to the builder.

The requested probe path /live does not exist in this API: src/health.controller.ts registers GET /health, returning {"ok": true}. To avoid a health check that would always fail against the current application, the Dockerfile targets /health. This is a deliberate evidence-based path adjustment; if /live is a required external contract, it needs a separately reviewed application route before switching the probe.

## Verification results

### Local build

Command: node ./node_modules/@nestjs/cli/bin/nest.js build

Output: no stdout or stderr. Exit code: 0.

### Diff whitespace check

Command: git diff --check

Exit code: 0. Exact warnings:

    warning: in the working copy of 'api/.dockerignore', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/Dockerfile', CRLF will be replaced by LF the next time Git touches it
    warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it

These are line-ending warnings, not whitespace failures. package.json and prisma/ were not edited for this task; pre-existing Prisma worktree changes remain outside the task scope.

### Docker daemon and image checks

Command: docker info

The client displayed Docker version 29.9.2, context desktop-linux, then returned:

    Server:
    permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine

Exit code: 1. The CLI is installed, but daemon access is unavailable from this environment; this does not establish whether Docker Desktop is stopped or access is blocked by permissions.

Command: docker info --format '{{.ServerVersion}}'

Output:

    permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine

Exit code: 1.

Command: docker images myservice

Output:

    permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine

Exit code: 1.

NOT EXECUTED: docker build -t myservice ., container run, health-state check, and image-size measurement. Docker Engine was not reachable via its named pipe, so no build, runtime health, or size result is claimed.

### PostgreSQL reachability

Command: Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

Output:

    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

The command exited 0 and returned False. Live PostgreSQL and HTTP checks remain NOT EXECUTED.

