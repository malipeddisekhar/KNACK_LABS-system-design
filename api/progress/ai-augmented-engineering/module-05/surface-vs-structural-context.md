# Module 05 — Surface vs. Structural Context

## How to Tell the Difference

A surface issue is a local defect whose correction leaves the rest of the output valid: the design, data model, trust boundaries, and permission model still fit. Examples in this NestJS/Prisma Team Collaboration API might include a mislabeled response field or a missing reconnect-state update when the event architecture is otherwise sound.

A structural issue fails this test: fixing it forces us to rethink architecture, data ownership, or a security boundary. A proposed event writer that inserts rows through a database trigger, returns raw rows, and does not scope access to a team is not repaired by polishing names or adding a reconnect stub. It bypasses application-level authorization and typed service contracts, so the design must be reconsidered.

The existing system gives useful boundaries for this assessment. The authenticated principal is `{ principalId, username }`; team authorization must bind that identity to the requested team and current membership. Prisma models define persisted relationships, while the shared error envelope and HTTP exception filter define the API's client-facing failure contract. A change that cuts across those boundaries is structural even if its code diff looks small.

## Sunk Cost, Context Pollution, and the Two-Iteration Rule

The sunk-cost trap makes us keep polishing an approach because time has already been spent on it. Context pollution compounds the problem: each speculative patch, contradictory assumption, and copied response makes it harder to see the original constraints, so later edits preserve mistakes simply because they are now embedded in the working context.

The Two-Iteration Rule is a stop condition. Make at most two targeted refinements to a sound approach; if they do not converge on the required behavior, restart in a clean context with a different approach. Carry forward verified requirements and evidence, but discard the failed implementation path and its unverified assumptions. The rule prevents repeated prompt tweaking from disguising a structural mismatch as a sequence of small surface defects.

## Output A vs. Output B

| Output | What is wrong or sound | Decision |
|---|---|---|
| **A — clean surface, structural flaw** | It looks complete, but a direct database trigger writes raw rows and lacks team-permission scoping. That bypasses the service boundary where authenticated principal identity, live team membership, validation, and the shared error contract can be enforced. Reconnection polish cannot make that authorization model safe. | **Restart** with a different design that emits through the application service, uses typed event data, and enforces team-scoped access before delivery. Treat the database-trigger design as a structural failure, not as a candidate for a third surface patch. |
| **B — incomplete stubs/reconnection, sound structure** | It still needs implementation work for stubs and reconnection behavior, but service-emitted events, typed payloads, and team-scoped channels preserve the right ownership and permission boundaries. Those gaps can be refined without replacing the architecture. | **Iterate** with focused changes to event completion and reconnect handling, then verify ordering, resumption, and authorization against the established contract. |

Output B is the better iteration candidate because its remaining work is local to a sound structure. Output A is restarted because its data path and missing authorization boundary require an architectural correction, regardless of how clean the surface appears.

## Practical Decision Check

Before refining an output, ask: “If I fix this issue, does the rest of the output remain valid?” If yes, make a bounded correction and verify it. If the fix changes who owns data, how a caller is authorized, or where events are produced and scoped, stop polishing and redesign that part. In this project, keep the `{ principalId, username }` identity, team membership boundary, Prisma persistence model, and shared error-envelope contract visible while reviewing any proposed event flow.
