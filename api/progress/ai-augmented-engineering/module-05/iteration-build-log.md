# Module 05 — BUILD Iteration Log

## Implementation Summary

`package.json` already contains NestJS, RxJS, and `ioredis`, but it does not declare a WebSocket gateway/adapter package. No dependency was added. The implementation uses NestJS Server-Sent Events (SSE) for one-way activity delivery and a guarded HTTP acknowledgement endpoint for pong responses.

`GET /teams/:id/activity/stream` authenticates the `{ principalId, username }` principal and runs `RequireTeamRoles('OWNER', 'ADMIN', 'MEMBER')`; the live guard queries `team_members` for the requested team and principal before the stream subscribes. The stream accepts `afterSequence`, `lastSequence`, or standard `Last-Event-ID`, replays persisted events in sequence order, buffers live events during replay, and emits only contiguous sequence values. A `connected` event supplies the connection ID; `ping` events are sent every 15 seconds, and a guarded `POST /teams/:id/activity/stream/:connectionId/pong` refreshes the acknowledgement time. Missing pong acknowledgements close and clean up the connection after 45 seconds; disconnects remove the subscriber and timer.

`TeamsService` persists activity rows and sequence updates inside the existing transaction, returns a typed event payload, and publishes it only after the transaction resolves. Team creation, invitation creation/revocation/acceptance, and comment creation use this post-commit path. The feed's live subscriber registry is process-local; horizontal deployments need shared pub/sub fan-out for immediate cross-instance delivery. Persisted replay covers reconnects, but does not replace that multi-instance live-broadcast requirement. No PostgreSQL integration request was run.

## Prompts / Working Briefs Used

1. **Initial user brief:** Inspect existing packages and auth/service boundaries; build a real-time team activity feed in `src/teams/` without unapproved packages or Prisma changes; publish typed events after transaction commit; authenticate and check live team membership; support cleanup, heartbeat/pong, and reconnect replay; add mocked focused tests.
2. **Structural implementation brief:** With no declared WebSocket package and RxJS already present, use SSE plus a guarded pong acknowledgement route; preserve team-scoped live authorization, ordered persisted replay, and post-commit publication.
3. **Refinement brief after compiler feedback:** Fix only errors in the new feed path and its tests, keep unrelated script/e2e/type errors untouched, and rerun the focused test and compile checks.

## Iteration 1

- **Type:** initial
- **Structural quality:** 4/5
- **Surface quality:** 3/5
- **Key issues found:** No WebSocket package is declared, so adding a gateway would require an unapproved dependency. SSE is available through NestJS and existing RxJS but is one-way, so it needs an explicit authenticated pong acknowledgement request. Reconnect replay must subscribe before querying history and buffer live events to avoid a replay/live gap.
- **Decision:** refine
- **Reasoning:** The ownership boundary remains sound when the service publishes only after the database transaction commits and the controller guard authorizes the live team membership. The initial implementation needed compile and lifecycle verification before it was ready.

**Prompt used:** “Use only existing dependencies; deliver typed team activity after commit, authorize the authenticated principal against live membership, and support ordered reconnect replay and heartbeat cleanup.”

## Iteration 2

- **Type:** refinement
- **Structural quality:** 4/5
- **Surface quality:** 3/5
- **Key issues found:** The first focused Jest run passed, but `tsc --noEmit` identified three issues in the new path: the test used the DOM `MessageEvent` type instead of Nest's SSE message type, Express route params can be `string | string[]`, and TypeScript did not narrow the invitation acceptance result to the accepted case. The same compiler run also reported errors in existing seed scripts, `test/module-05.e2e-spec.ts`, and `test/setup-test-db.ts` outside this change.
- **Decision:** refine
- **Reasoning:** These were bounded type issues, not reasons to restart the architecture. The existing membership behavior was preserved while route param normalization and the accepted-result branch were made explicit.

**Prompt used:** “Resolve only the feed/test typing, route-parameter union, and result-narrowing errors revealed by the compiler; do not change unrelated files.”

## Iteration 3

- **Type:** refinement
- **Structural quality:** 4/5
- **Surface quality:** 4/5
- **Key issues found:** Final focused tests and the direct Nest build pass. The package `npm run build` launcher is broken in this environment, and full `tsc --noEmit` still reports unrelated existing errors. No runtime database or multi-process Redis pub/sub test was performed; live subscribers are local to one process.
- **Decision:** ship
- **Reasoning:** The implementation satisfies the requested bounded feed path without a new package or schema edit. The process-local fan-out boundary and absence of database-backed runtime proof are documented so this result is not mistaken for a horizontally scaled production validation.

**Prompt used:** “Rerun the focused feed suite, run the requested build/TypeScript check and diff check, and record exact outputs and limitations.”

## Verification Commands and Exact Outputs

### Focused unit tests

Command:

```text
node --experimental-vm-modules ./node_modules/jest/bin/jest.js src/teams/team-activity-feed.spec.ts --runInBand
```

Output:

```text
(node:9204) ExperimentalWarning: VM Modules is an experimental feature and might change at any time
(Use `node --trace-warnings ...` to show where the warning was created)
Test Suites: 1 passed, 1 total
Tests:       4 passed, 4 total
Snapshots:   0 total
Time:        1.981 s
Ran all test suites matching src/teams/team-activity-feed.spec.ts.
EXIT_CODE=0
```

The tests use mocked Prisma and JWT verification. They cover replay/live overlap ordering and disconnect cleanup, ping/pong timeout cleanup, JWT principal propagation plus live team-role query scoping, and service publication after the transaction resolves. They do not connect to PostgreSQL.

### Requested npm build

Command:

```text
npm run build
```

Output:

```text
Could not determine Node.js install directory
node:internal/modules/cjs/loader:1607
  throw err;
  ^

Error: Cannot find module 'C:\Program Files\nodejs\node_modules\npm\bin\node_modules\npm\bin\npm-prefix.js'
    at Module._resolveFilename (node:internal/modules/cjs/loader:1603:15)
    at wrapResolveFilename (node:internal/modules/cjs/loader:1145:27)
    at defaultResolveImplForCJSLoading (node:internal/modules/cjs/loader:1169:15)
    at resolveForCJSWithHooks (node:internal/modules/cjs/loader:1196:12)
    at Module._load (node:internal/modules/cjs/loader:1370:5)
    at wrapModuleLoad (node:internal/modules/cjs/loader:261:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:171:5)
    at node:internal/main/run_main_module:36:49 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v26.13.0
EXIT_CODE=1
```

### Direct TypeScript check

Command:

```text
node ./node_modules/typescript/bin/tsc --noEmit
```

Output:

```text
scripts/module-02-seed-query.ts(24,9): error TS2353: Object literal may only specify known properties, and 'createdBy' does not exist in type '((Without<LinkCreateInput, LinkUncheckedCreateInput> & LinkUncheckedCreateInput) | (Without<...> & LinkCreateInput)) & object'.
scripts/module-02-unique-code-check.ts(33,9): error TS2353: Object literal may only specify known properties, and 'createdBy' does not exist in type '((Without<LinkCreateInput, LinkUncheckedCreateInput> & LinkUncheckedCreateInput) | (Without<...> & LinkCreateInput)) & object'.
scripts/module-02-unique-code-check.ts(42,11): error TS2353: Object literal may only specify known properties, and 'createdBy' does not exist in type '((Without<LinkCreateInput, LinkUncheckedCreateInput> & LinkUncheckedCreateInput) | (Without<...> & LinkCreateInput)) & object'.
test/module-05.e2e-spec.ts(287,34): error TS2345: Argument of type '(args: { select?: LinkSelect<DefaultArgs> | null | undefined; omit?: LinkOmit<DefaultArgs> | null | undefined; include?: LinkInclude<DefaultArgs> | null | undefined; data: ((Without<...> & LinkUncheckedCreateInput) | (Without<...> & LinkCreateInput)) & object; }) => Promise<...>' is not assignable to parameter of type '(args: { select?: LinkSelect<DefaultArgs> | null | undefined; omit?: LinkOmit<DefaultArgs> | null | undefined; include?: LinkInclude<DefaultArgs> | null | undefined; data: ((Without<...> & LinkUncheckedCreateInput) | (Without<...> & LinkCreateInput)) & object; }) => Prisma__LinkClient<...>'.
  Property 'clickEvents' is missing in type 'Promise<{ id: string; createdAt: Date; code: string; longUrl: string; principalId: string; expiresAt: Date | null; tags: string[]; }>' but required in type 'Prisma__LinkClient<{ id: string; createdAt: Date; code: string; longUrl: string; principalId: string; expiresAt: Date | null; tags: string[]; }, never, DefaultArgs, { omit: GlobalOmitConfig | undefined; }>'.
test/module-05.e2e-spec.ts(317,76): error TS2345: Argument of type '() => Promise<never>' is not assignable to parameter of type '(args: { select?: LinkSelect<DefaultArgs> | null | undefined; omit?: LinkOmit<DefaultArgs> | null | undefined; include?: LinkInclude<DefaultArgs> | null | undefined; data: ((Without<...> & LinkUncheckedCreateInput) | (Without<...> & LinkCreateInput)) & object; }) => Prisma__LinkClient<...>'.
  Property 'clickEvents' is missing in type 'Promise<never>' but required in type 'Prisma__LinkClient<{ id: string; createdAt: Date; code: string; longUrl: string; principalId: string; expiresAt: Date | null; tags: string[]; }, never, DefaultArgs, { omit: GlobalOmitConfig | undefined; }>'.
test/setup-test-db.ts(14,21): error TS1470: The 'import.meta' meta-property is not allowed in files which will build into CommonJS output.
EXIT_CODE=1
```

No errors were reported from the changed feed, controller, module, team service, guard, or unit-test files after refinement.

### Direct Nest build (npm launcher fallback)

Command:

```text
node ./node_modules/@nestjs/cli/bin/nest.js build
```

Output:

```text
EXIT_CODE=0
```

### Diff check

Command:

```text
git diff --check
```

Output:

```text
warning: in the working copy of 'api/src/app.module.ts', CRLF will be replaced by LF the next time Git touches it
EXIT_CODE=0
```

The warning concerns line-ending normalization in the existing `src/app.module.ts`; the check reported no whitespace errors. No files in `prisma/` were changed.
