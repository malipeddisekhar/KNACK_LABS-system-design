# System Context — NestJS/Prisma Team Collaboration API

## Architecture Summary

- **Application:** Private NestJS API. `src/app.module.ts` composes Auth, Database, Links, Analytics, and Teams modules; it installs a global `ValidationPipe` and configures the queue provider.
- **Feature layout:** Domain-oriented modules use `*.module.ts`, `*.controller.ts`, `*.service.ts`, guards, and a `dto/` directory. `TeamsModule` imports Auth and Database modules and provides the team service and live role guard.
- **Persistence:** Prisma schema lives in `prisma/schema.prisma`; migrations are timestamp-named directories under `prisma/migrations/`. PostgreSQL is accessed through `PrismaService` and `@prisma/adapter-pg`. Team tables use snake_case names/columns while Prisma models and fields use PascalCase/camelCase.
- **Team domain:** Team, TeamMember, TeamInvitation, ActivityEvent, TeamComment, and AuditLog model team membership, recipient-bound invitation lifecycle, ordered activity, comments/mentions, and incident records. Multi-row mutations use parameterized SQL in transactions where consistency requires it.
- **Authentication and authorization:** `JwtAuthGuard` validates a Bearer token and puts a principal on the request. The principal shape is `{ principalId, username }`. Team role protection queries current membership in PostgreSQL for the route's team rather than trusting a stale role claim.
- **Shared response behavior:** DTO validation is applied by the global `ValidationPipe` (`transform`, `whitelist`, and `forbidNonWhitelisted`). `HttpExceptionFilter` converts exceptions to a stable error envelope and hides unexpected 5xx details.

## Naming and File Conventions

- Nest feature code is grouped by domain: controller handles HTTP, service owns behavior/data access, module wires providers, guard enforces access, and DTO classes describe request bodies.
- TypeScript imports in the team code commonly use `.js` extensions. Class/type names use PascalCase; methods and fields use camelCase.
- Prisma model names use singular PascalCase. Database tables and mapped columns use snake_case (`@@map` / `@map`); PostgreSQL timestamps are `TIMESTAMPTZ(6)` and JSON metadata uses `JSONB`.
- SQL migration directories start with a timestamp and contain `migration.sql`. Keep schema and migration changes aligned; do not edit generated Prisma client output by hand.
- Use `Prisma.sql` tagged statements for user-influenced values. Keep multi-row state/audit/activity writes inside one Prisma transaction when their success must be atomic.

## Error Envelope and HTTP Status Codes

Every filtered error response has this JSON shape, with exactly these three fields and no stack trace:

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "Insufficient team role.",
    "request_id": "<request-id>"
  }
}
```

`request_id` matches the `X-Request-ID` response header. For an unexpected exception, the client receives `500` with code `INTERNAL_SERVER_ERROR` and the generic message `An unexpected error occurred. Please try again later.`; internal details stay server-side.

| HTTP status | Stable error code |
|---:|---|
| 400 | `BAD_REQUEST` |
| 401 | `UNAUTHORIZED` |
| 403 | `FORBIDDEN` |
| 404 | `NOT_FOUND` |
| 405 | `METHOD_NOT_ALLOWED` |
| 408 | `REQUEST_TIMEOUT` |
| 409 | `CONFLICT` |
| 410 | `GONE` |
| 415 | `UNSUPPORTED_MEDIA_TYPE` |
| 422 | `UNPROCESSABLE_ENTITY` |
| 429 | `TOO_MANY_REQUESTS` |
| 500 | `INTERNAL_SERVER_ERROR` |
| 501 | `NOT_IMPLEMENTED` |
| 502 | `BAD_GATEWAY` |
| 503 | `SERVICE_UNAVAILABLE` |
| 504 | `GATEWAY_TIMEOUT` |
| Other | `HTTP_<status>` |

Common Team route meanings: malformed/invalid request is `400`; missing or invalid Bearer credentials is `401`; non-member or insufficient live role is `403`; missing resource is `404`; duplicate/invalid lifecycle transition is `409`; expired invitation is `410`. Successful POST routes generally return `201`; reads and action responses return `200` unless the controller specifies otherwise.

### Mandatory Response Assertions for Task Contexts and Tests

For every filtered error response, assert the status **and** the complete body shape; a status-only assertion is insufficient. The `error` object must contain exactly `code`, `message`, and `request_id`, with no additional keys, and the body `request_id` must equal the `X-Request-ID` response header. Example:

```ts
expect(response.status).toBe(403);
expect(response.body).toEqual({
  error: {
    code: 'FORBIDDEN',
    message: expect.any(String),
    request_id: expect.any(String),
  },
});
expect(response.headers['x-request-id']).toBe(response.body.error.request_id);
```

The mapping is `400 BAD_REQUEST`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 CONFLICT`, and `410 GONE`; use the full table above for other statuses. Successful route responses are not error envelopes. For unexpected 5xx responses, assert `INTERNAL_SERVER_ERROR`, the generic client message above, and no stack trace or internal detail.

Invitation acceptance must distinguish lifecycle outcomes even when the conditional update affects zero rows. Use database time for the expiry boundary: a still-`PENDING` invitation with `now >= expiresAt` becomes `EXPIRED` and returns `410 GONE`; an already accepted, revoked, or expired invitation (including a competing acceptance) returns `409 CONFLICT`; a missing invitation returns `404 NOT_FOUND`; a recipient mismatch returns `403 FORBIDDEN`. Do not map every failed conditional update to one generic conflict.

For activity sequence allocation, use the schema's `Team.activitySequence` counter and `ActivityEvent.sequence` (`BigInt`, unique with `teamId`). Increment the team counter and insert the event in the same transaction; do not allocate with an unprotected `MAX(sequence) + 1`. Rollback must leave the counter and event consistent.

## Validation and Auth Details

- The global pipe transforms DTOs, removes no undeclared fields silently (`forbidNonWhitelisted: true`), and validates class-validator decorators. DTOs should use explicit decorators and bounds. Team comment body emptiness is also checked in `TeamsService`.
- `JwtAuthGuard` requires an `Authorization: Bearer <token>` header. Missing/malformed or invalid/expired credentials become `401`.
- `CurrentPrincipal` yields `{ principalId, username }`; it throws `401` if no user is attached. There is no email field on this principal, so do not infer an email or map usernames to email addresses.
- `RequireTeamRoles(...)` combines JWT authentication with `TeamRoleGuard`; the guard validates the team UUID and reads the caller's current `team_members.role`. Unauthorized/non-member callers get `403`.

## Explicit Constraints for AI-Assisted Tasks

1. Add no new dependency without explicit approval.
2. Reuse the existing JWT/team-role and common error-handling paths; do not create parallel auth or error formats.
3. Use parameterized SQL; never interpolate request values into SQL text or log credentials/raw invitation tokens.
4. Keep each implementation task at **150 changed lines or fewer** and make focused edits only.
5. Test commands must use an explicitly configured `TEST_DATABASE_URL` whose database name is exactly `url_shortener_test`. Never derive it from `DATABASE_URL` or run destructive tests against another database.
6. Do not modify unrelated modules or `.env`; do not hand-edit generated client files.
7. Separate implemented behavior from verified behavior. The local Task 9 integration run previously could not connect to PostgreSQL at `127.0.0.1:5432`; Docker access and Prisma engine download were also blocked. No migration application or end-to-end pass should be claimed without fresh evidence.

## Source Files Consulted

`package.json`, `src/app.module.ts`, `src/common/error-envelope.ts`, `src/common/http-exception.filter.ts`, `src/auth/auth.types.ts`, `src/auth/current-principal.decorator.ts`, `src/auth/jwt-auth.guard.ts`, `src/database/prisma.service.ts`, `prisma/schema.prisma`, `src/teams/teams.module.ts`, `src/teams/teams.controller.ts`, `src/teams/team-role.guard.ts`, and the Module 2 progressive decomposition record.
