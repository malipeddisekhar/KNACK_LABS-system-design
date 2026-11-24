# Team Collaboration API

This reference follows `src/teams/teams.controller.ts`, its DTOs and service, `TeamRoleGuard`, the global validation pipe, and the common HTTP exception filter. All team-scoped path IDs use UUID parsing. Authenticated requests use the existing bearer-token flow; protected team routes also query the caller's current membership and role for the requested team.

## Authentication, validation, and errors

Send `Authorization: Bearer <JWT>` to authenticated routes. The global `ValidationPipe` transforms DTOs, rejects unknown properties, and applies the listed `class-validator` rules. Role checks use the live `team_members` row, not a role copied from the token. Supported roles are `OWNER`, `ADMIN`, and `MEMBER`; `VIEWER` is not a schema role.

Errors use the common envelope and the same request ID in the `X-Request-ID` header:

```json
{"error":{"code":"BAD_REQUEST","message":"...","request_id":"<request-id>"}}
```

Status-to-code mappings relevant here are 400 `BAD_REQUEST`, 401 `UNAUTHORIZED`, 403 `FORBIDDEN`, 404 `NOT_FOUND`, 409 `CONFLICT`, and 410 `GONE`. Unexpected errors return a generic 500 message; stack traces are not returned to clients.

## Endpoints

| Method and path | Auth and role | Input / validation | Success |
|---|---|---|---|
| `POST /teams` | Authenticated | `name: string`, non-empty, max 100 characters; service trims and rejects whitespace-only values | 201, `{id,name,createdAt,updatedAt}`; creator is OWNER |
| `POST /teams/:id/invitations` | OWNER or ADMIN in `:id` | `invitedEmail: email` max 254; `inviteeUserId: non-empty string` max 128; optional `role: ADMIN \| MEMBER` | 201, invitation metadata plus one-time raw `token`; 409 for existing member or pending duplicate |
| `DELETE /teams/:id/invitations/:invitationId` | OWNER or ADMIN in `:id` | UUID team and invitation IDs | 200, `{id,teamId,status:"REVOKED"}`; only PENDING can be revoked |
| `POST /teams/invitations/accept` | Authenticated | `token: non-empty string`, max 128 | 201, `{id,teamId,role}`; only the bound recipient can accept once |
| `POST /teams/:id/comments` | OWNER, ADMIN, or MEMBER in `:id` | `body: string`, non-empty, max 5000; service trims and rejects whitespace-only values; mentions use `@<principalId>` | 201, `{id,teamId,authorId,body,mentions,createdAt}` |
| `GET /teams/:id/comments` | OWNER, ADMIN, or MEMBER in `:id` | UUID team ID | 200, ordered comment array |
| `GET /teams/:id/activity?afterSeq=N` | OWNER, ADMIN, or MEMBER in `:id` | `afterSeq` is a non-negative signed-64-bit integer; default `0` | 200, ascending REST event rows with `id,sequence,actorId,type,targetType,targetId,metadata,createdAt` |
| `GET /teams/:id/activity/stream?afterSequence=N` | OWNER, ADMIN, or MEMBER in `:id`; live membership/role is rechecked | Cursor may be `afterSequence`, `lastSequence`, or `Last-Event-ID`; default `0` | 200, Server-Sent Events; business event data has `teamId,sequence,type,actorId,payload,createdAt`, with SSE `id` equal to sequence |
| `POST /teams/:id/activity/stream/:connectionId/pong` | OWNER, ADMIN, or MEMBER in `:id`; connection must belong to caller and team | UUID team and connection IDs | 201, `{acknowledged:true}` |
| `GET /teams/:id/audit-logs?action=...&actorId=...` | OWNER or ADMIN in `:id` | Optional exact `action` and `actorId` filters | 200, descending audit rows with `id,teamId,actorId,action,targetType,targetId,outcome,metadata,createdAt` |

The team feature does not currently define viewer permissions, member removal/role-change/team-delete routes, task resources, or task-bound comments. Those actions are not represented as supported endpoints here. POST routes use Nest's default 201 status; GET/SSE use 200 and DELETE uses 200.

## Example requests and responses

Create a team:

```http
POST /teams
Authorization: Bearer <JWT>
Content-Type: application/json

{"name":"Design"}
```

```json
{"id":"<team-uuid>","name":"Design","createdAt":"<timestamp>","updatedAt":"<timestamp>"}
```

Invite a principal (the email is normalized for storage; recipient binding uses the explicit principal ID):

```http
POST /teams/<team-uuid>/invitations
Authorization: Bearer <OWNER_OR_ADMIN_JWT>
Content-Type: application/json

{"invitedEmail":"member@example.test","inviteeUserId":"principal-member","role":"MEMBER"}
```

```json
{"id":"<invitation-uuid>","teamId":"<team-uuid>","invitedEmail":"member@example.test","role":"MEMBER","status":"PENDING","expiresAt":"<timestamp>","createdAt":"<timestamp>","token":"<one-time-token>"}
```

Post a comment with a member mention:

```http
POST /teams/<team-uuid>/comments
Authorization: Bearer <MEMBER_JWT>
Content-Type: application/json

{"body":"Release review: @principal-owner please check the checklist."}
```

The REST activity representation includes `targetType`/`targetId` and uses `metadata`; the SSE event instead exposes `payload` and omits those two target fields. SSE emits `connected`, periodic `ping`, business event types, and `authorization_revoked` or `timeout` lifecycle events. The feed is process-local; cross-instance fan-out is not established by the mocked tests.

## Data and audit notes

Team creation, invitation creation/acceptance/revocation, and comment creation write audit and activity records inside their Prisma transaction; typed feed publication occurs only after commit. Invitation tokens are stored as SHA-256 hashes and returned once at creation. Current invitation audit metadata includes the normalized invited email, while activity payloads omit it. Audit response redaction removes values under keys matching token/secret/password/authorization/credential/API-key patterns; `invitedEmail` is not currently among those key patterns, so treat audit access as PII-bearing and restrict it accordingly.
