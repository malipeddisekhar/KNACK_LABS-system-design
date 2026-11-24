# Production Readiness — Module 01 VERIFY: Container Readiness

## Review outcome

The Dockerfile is a two-stage Node 20 slim build. The builder copies package.json and package-lock.json, runs npm ci, copies the build context, runs npm run build --if-present, then prunes development dependencies with npm prune --omit=dev. The clean runtime stage creates system group appgroup and system user appuser, then copies only pruned node_modules, compiled dist/, and package.json from the builder; it exposes port 3000 and starts dist/main.js as the non-root user.

The .dockerignore excludes .git, .gitignore, node_modules, .env and .env.* while restoring .env.example, plus tests, coverage, generated build/cache outputs, logs, Markdown, and common OS/editor artifacts. The builder still receives package-lock.json and prisma/ because neither is excluded.

The HEALTHCHECK uses curl -f against localhost on PORT (default 3000) at /health. This matches src/health.controller.ts: @Controller('health') and @Get() register GET /health, returning { ok: true }. There is no /live route in that controller, so /live would make the container unhealthy with the current application.

## Verification command results

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

These are line-ending warnings; no whitespace errors were reported.

### Docker daemon

Command: docker info
Exit code: 1. Client output identified Docker Version 29.9.2 and context desktop-linux. Exact server error:

    permission denied while trying to connect to the docker API at npipe:////./pipe/dockerDesktopLinuxEngine

The Docker CLI exists, but access to the Docker Engine named pipe is denied. This result does not establish whether Docker Desktop is stopped or the current process lacks permission.

NOT EXECUTED: docker build, container run, Docker health-state verification, and image-size inspection. No live Docker result is claimed.

### PostgreSQL reachability

Command: Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet

Exact output:

    WARNING: TCP connect to (127.0.0.1 : 5432) failed
    False

Exit code: 0. Live PostgreSQL/HTTP and database-backed integration checks remain NOT EXECUTED.

## Scope boundary

This verification did not modify prisma/ or package.json. The successful Nest build validates compilation in the current workspace, not a Docker image build or running container.
