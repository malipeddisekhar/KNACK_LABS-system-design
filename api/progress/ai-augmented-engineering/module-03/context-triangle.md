# Module 3 CONTEXT — Context Triangle for Team Collaboration

This note assembles only the context needed to ask an AI for a safe, reviewable change in the NestJS/Prisma API. It separates system-wide architecture, the immediate Team Collaboration files, and the constraints that must shape the work. It is a prompt-planning artifact; it does not authorize or make source or schema edits.

## Context Triangle

### 1. Architectural Context — How the application is organized

- The API is a NestJS application divided into modules. `src/app.module.ts` registers `TeamsModule`; `src/teams/teams.module.ts` composes the team controller, service, live role guard, auth module, and database module.
- Controllers define HTTP boundaries and delegate to services. `TeamsService` uses `PrismaService` and parameterized PostgreSQL SQL inside transactions for changes that must commit together.
- `PrismaService` selects PostgreSQL connection configuration. Prisma schema and SQL migrations define persistent models and indexes; test execution has a separate database safety boundary.
- Authentication supplies a `Principal` with `principalId` and `username`. Protected team routes must use the current database membership/role, not assume a role claim remains valid after a demotion.
- Team feature contracts span related records: `Team`, `TeamMember`, `TeamInvitation`, `AuditLog`, `ActivityEvent`, and `TeamComment`. Mutation transactions may need to keep state changes, audit records, and sequence-ordered activity events consistent.
- Shared application conventions include request validation, the common error envelope/filter, UUID parsing, and explicit HTTP status behavior. New work should inspect and follow the existing local implementation rather than duplicate infrastructure.

### 2. Local Context — The smallest relevant project surface

**Task-specific starting set (read these first):**

- `src/teams/teams.controller.ts` — existing team, invitation, activity, comment, and audit routes and guard decorators.
- `src/teams/teams.service.ts` — current SQL, transactions, recipient binding, sequence allocation, comment mention resolution, and audit redaction behavior.
- `src/teams/team-role.guard.ts` — live membership/role lookup and route parameter handling.
- `src/teams/teams.module.ts` and `src/teams/dto/*.ts` — module wiring and request DTO conventions.
- `prisma/schema.prisma` plus only the relevant team migration directories — model names, field mappings, constraints, indexes, and database behavior.
- `src/database/prisma.service.ts` and `src/database/database.module.ts` — connection selection and provider wiring.
- `src/auth/current-principal.decorator.ts`, `src/auth/auth.types.ts`, and `src/auth/jwt-auth.guard.ts` — identity shape and authentication boundary; do not infer email from username or principal ID.
- `src/common/error-envelope.ts` and `src/common/http-exception.filter.ts` — shared error response shape.
- `src/teams/teams.collaboration.spec.ts`, `jest.config.ts`, and `test/setup-test-db.ts` — integration coverage, runner conventions, and test database guard.

**Current feature facts useful to later prompts:**

- Team creation assigns the creator an `OWNER` membership and records an audit row transactionally.
- Invitation tokens are persisted as hashes; acceptance is bound to an explicitly stored recipient principal ID, transitions a pending invitation once, and rejects expiry/replay.
- Activity events use a per-team sequence. Comment events are emitted with comment creation in the same transaction.
- Comment mentions use exact `@principalId` identifiers and store only identifiers that are active members of that team.
- Audit reads are restricted to live `OWNER`/`ADMIN` membership, accept action/actor filters, sort deterministically, and redact secret-like metadata keys.

### 3. Constraint Context — Boundaries the prompt must preserve

- Keep every task's source/schema diff within **150 changed lines** and make one coherent change at a time.
- For this CONTEXT step, write only under `progress/`; do not modify `src/teams/` or `prisma/`.
- For later implementation, do not edit `src/auth/`, unrelated feature modules, `.env`, or install packages unless the task explicitly requires and authorizes it.
- Preserve live role checks on protected actions, recipient binding, single-use/expiry behavior, per-team event ordering, transactional consistency, and complete audit fields. Never log or return raw invitation tokens or credentials.
- Keep SQL parameterized; do not interpolate user input into SQL text. Use the established error envelope and return codes.
- Tests must use an explicitly configured `TEST_DATABASE_URL` whose database name is exactly `url_shortener_test`; never derive it from `DATABASE_URL` or point tests at development/production data.
- Runtime verification is currently constrained: the previous full Jest run had 7 passing suites / 34 passing tests and one integration test failure because PostgreSQL at `127.0.0.1:5432` refused the connection. Docker access was denied, PostgreSQL service inspection was blocked, and Prisma could not resolve `binaries.prisma.sh`; migrations were not applied. Treat integration behavior as unverified until the guarded test database and required tooling are available.
- Do not claim UPSK advancement or acceptance unless the CLI confirms it. The most recent explicit-URL status check failed; the active checkpoint is based on the learner's supplied state until UPSK responds.

## Essential vs. Optional vs. Noise

| Class | Include in an AI task prompt | Why |
|---|---|---|
| **Essential** | Exact task outcome and acceptance cases; the relevant controller/service/guard/DTO; the specific Prisma models and migration conventions; principal identity shape; error contract; applicable tests and database safety rules; the 150-line and no-unrelated-edit limits. | These determine behavior, authorization, persistence, and what counts as verified. |
| **Optional** | `src/app.module.ts` for route/module registration; shared database/common modules; a neighboring feature's narrow pattern; package/Jest metadata; relevant progress notes; test logs with secrets removed. | Add only when the task touches registration, shared behavior, tests, or an unresolved decision. |
| **Noise for most Team tasks** | Entire `node_modules/`, generated Prisma client source, lockfile contents, unrelated links/analytics/cache files, every historical progress artifact, full repository dumps, and unrelated infrastructure configuration. | These add volume without changing the immediate design decision; generated output can obscure the handwritten source of truth. |
| **Never include** | `.env` values, passwords, JWTs, database URLs, raw invitation tokens, private credentials, or unredacted logs containing them. | They are secrets, not useful task context. Share sanitized variable names and safe error summaries instead. |

## Reusable Prompt Context Packet

For a later implementation request, provide: (1) one-sentence behavior goal; (2) only the essential files above; (3) current identity and schema facts; (4) explicit authorization, transaction, replay, ordering, and error invariants relevant to that task; (5) changed-line budget and out-of-scope paths; and (6) exact verification command plus safe test-database requirements. Ask the agent to list assumptions before editing, show the focused diff, report per-file line counts, and distinguish checks run from checks blocked by the environment.

**Evidence boundary:** this packet summarizes checked workspace structure and earlier task artifacts. The failed UPSK status request means this local note does not prove that the remote checkpoint advanced or supply the official next-step prompt.
