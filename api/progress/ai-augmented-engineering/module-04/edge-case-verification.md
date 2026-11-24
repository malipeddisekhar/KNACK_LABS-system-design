# Module 04 — STEP 4 VERIFY: Edge-Case Verification

## Environment and Executed Safe Check

PostgreSQL reachability check:

```powershell
Test-NetConnection -ComputerName 127.0.0.1 -Port 5432 -InformationLevel Quiet
```

Observed output: `WARNING: TCP connect to (127.0.0.1 : 5432) failed` and `False`. No team/invitation HTTP integration request was run, no migration was applied, and no database other than `url_shortener_test` was accessed.

Safe existing unit check, selected because it uses mocked Prisma/queue dependencies and does not connect to PostgreSQL:

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/analytics/analytics.service.spec.ts --runInBand
```

Observed summary: `Test Suites: 1 passed, 1 total`; `Tests: 8 passed, 8 total`; exit code `0`. Jest printed its experimental VM Modules warning and an open-handles warning after completion. This unrelated mocked unit suite is not evidence that any of the five Team Collaboration HTTP cases below executed or passed.

## Five Edge-Case Tests

For each row, **Expected** is the requested HTTP behavior. **Actual** is explicitly marked as not executed because the local database port is unavailable. The static code-path note is source inspection only, not an observed HTTP response. Error codes below follow `src/common/http-exception.filter.ts:104-113`.

| Test | Request | Expected | Actual / code-path evidence |
|---|---|---|---|
| **Test 1 — Invite existing team member** | Authenticated `OWNER`/`ADMIN`: `POST /teams/<team-uuid>/invitations`; JSON `{"invitedEmail":"member@example.test","inviteeUserId":"<existing-member-user-id>"}`. The ID must match a row in `team_members` for that team. | `409 CONFLICT` (`error.code: "CONFLICT"`). | **NOT EXECUTED** (no live PostgreSQL-backed API request). Static path: `src/teams/teams.service.ts:74-82` queries membership when `dto.inviteeUserId` is supplied and throws `ConflictException` for a match; the controller supplies the authenticated principal as actor (`teams.controller.ts:76-84`). Important boundary: if the request omits `inviteeUserId`, the service cannot identify an existing member from email alone and this check is skipped. |
| **Test 2 — Empty/whitespace team name** | Authenticated caller: `POST /teams`; send once with `{"name":""}` and once with `{"name":"   "}`. | `400 BAD_REQUEST` for both. | **NOT EXECUTED** (no live HTTP request). Static path: `CreateTeamDto` has `@IsString()`, `@IsNotEmpty()`, and `@MaxLength(100)` (`src/teams/dto/create-team.dto.ts:3-7`); the global pipe is enabled (`src/app.module.ts:116-122`). Empty input fails DTO validation; whitespace passes `IsNotEmpty` but `TeamsService.create` trims and throws `BadRequestException` when the result is empty (`src/teams/teams.service.ts:39-42`). The route requires JWT auth (`src/teams/teams.controller.ts:61-65`), so use valid credentials to observe the `400`. |
| **Test 3 — Unauthenticated invitation request** | No `Authorization` header: `POST /teams/<team-uuid>/invitations` with an otherwise valid invitation body. | `401 UNAUTHORIZED`. | **NOT EXECUTED** (no live HTTP request). Static path: `RequireTeamRoles` composes `JwtAuthGuard` and `TeamRoleGuard` (`src/teams/team-role.guard.ts:23-26`); the invitation route applies it (`src/teams/teams.controller.ts:76-84`). The JWT guard runs before the membership check, so missing credentials should map to `401`. |
| **Test 4 — Authenticated non-member invitation request** | Valid authenticated principal with no membership in an existing team: `POST /teams/<team-uuid>/invitations` with valid JSON. | `403 FORBIDDEN`. | **NOT EXECUTED** (no live HTTP request). Static path: `TeamRoleGuard` reads `teamId` and `request.user.principalId`, queries `team_members` with parameterized SQL, and throws `ForbiddenException` when membership/role is insufficient (`src/teams/team-role.guard.ts:44-55`). The route requires `OWNER` or `ADMIN` (`src/teams/teams.controller.ts:76-84`). |
| **Test 5 — Invalid email format** | Authenticated `OWNER`/`ADMIN`: `POST /teams/<team-uuid>/invitations`; JSON `{"invitedEmail":"not-an-email"}`. | `400 BAD_REQUEST`. | **NOT EXECUTED** (no live HTTP request). Static path: `CreateTeamInvitationDto.invitedEmail` uses `@IsEmail()` and `@MaxLength(254)` (`src/teams/dto/create-team-invitation.dto.ts:3-6`); `AppModule` installs the transforming/whitelisting validation pipe (`src/app.module.ts:116-122`). Use an authorized caller so the guard does not stop the request before body validation. |

## Verification Boundary

The five `Actual` fields are not claimed as observed statuses. The request/expected behavior is documented for a future run against a reachable local API and the guarded test database. The existing `teams.collaboration.spec.ts` is database-backed; it was not run because `127.0.0.1:5432` did not accept a TCP connection. The safe Jest run above passed but covers analytics unit behavior only. No source or schema files were edited.
