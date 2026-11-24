# Module 1 BUILD — Task 2: Extension Points

## Inspection Boundary

This inventory uses directory names, filenames, and `package.json` metadata only. No application source, Prisma schema contents, migration SQL, generated model contents, `.env`, or runtime behavior was inspected. The placement recommendations below are structural inferences, not verified behavior contracts.

## API Routes and Controllers

Observed controller/module/service filenames:

- Root: `src/app.controller.ts`, `src/health.controller.ts`, `src/ready.controller.ts`, `src/app.module.ts`.
- Feature groups: `src/auth/auth.controller.ts`, `auth.module.ts`, `auth.service.ts`; `src/links/links.controller.ts`, `links.module.ts`, `links.service.ts`; and `src/redirect/redirect.controller.ts`.
- Other feature directories include `analytics/`, `cache/`, and `database/`.

**Extension-point inference:** The project appears grouped by feature/domain, with controllers and modules alongside services and DTOs, rather than one file per route. A new feature likely belongs in `src/<feature>/` with its controller, module, service, and DTOs; whether the root module auto-discovers or explicitly imports it is not verifiable from filenames alone. Exact HTTP methods, paths, and controller registration remain unverified.

## Models and Migrations

Observed paths:

- `prisma/schema.prisma`
- `prisma/migrations/`, with timestamped migration directories and `migration.sql` files.
- Generated client/model paths: `src/generated/prisma/`, including `models/Link.ts` and `models/ClickEvent.ts`.

**Extension-point inference:** The names suggest the Prisma schema and migration directories are the model/migration extension points; generated model files are generated output, not an evidenced file-per-model authoring convention. Schema fields, relationships, constraints, migration commands, and whether generated output is committed were not verified because file contents were not read.

## Guards and Middleware

Observed names include `src/auth/jwt-auth.guard.ts`, `src/auth/rate-limit.guard.ts`, `src/auth/rate-limit.decorator.ts`, `src/auth/current-principal.decorator.ts`, `src/request-id.middleware.ts`, and `src/common/http-exception.filter.ts`.

These filenames show existing guard, middleware, decorator, and exception-filter patterns. No interceptor filename appeared in the listing. Application behavior, registration scope, and which routes use each guard are unverified.

## Background and Asynchronous Work

Observed names include `src/analytics/analytics.processor.ts`, `analytics.service.ts`, `analytics.module.ts`, `src/worker.ts`, `src/worker.module.ts`, and `src/common/bull-config.ts`. Package metadata lists `@nestjs/bullmq`, `bullmq`, and `ioredis`.

**Extension-point inference:** The analytics processor and worker structure, together with queue dependencies, indicate a queue/background-job pattern. Queue names, retry behavior, payload contracts, and failure handling cannot be established from filenames and package metadata.

## Summary

The visible layout favors feature/domain modules, Prisma schema-plus-migrations, named guards/middleware, and a BullMQ-style worker area. Treat these as structural clues; verify registration and runtime contracts before implementing a feature.
