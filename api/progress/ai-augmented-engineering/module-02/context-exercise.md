# Module 2 CONTEXT — Atomic Decomposition: Team Invitations

## Feature Slice

“Add team invitations” contains several independently verifiable tasks. This decomposition records the required data, authorization, lifecycle, notification, and audit boundaries before any application code is generated.

## Atomic Subtasks

1. **Invitation data model and migration:** Define `id`, `teamId`, `inviterUserId`, `invitedEmail`, `role`, `tokenHash`, `status`, `expiresAt`, `acceptedByUserId`, and timestamps. Use statuses `PENDING`, `ACCEPTED`, `REVOKED`, and `EXPIRED`. Add a uniqueness rule that prevents duplicate `PENDING` invitations for the same `(teamId, invitedEmail)`.
2. **Create invitation endpoint:** Implement `POST /teams/:id/invitations`. Re-check the caller’s current owner/admin role and return `403` otherwise. Create a hashed, single-use token with a seven-day expiry; return `409` when the invitee is already a member or a duplicate pending invitation exists; write a complete audit entry.
3. **Invitation notification:** Dispatch the invitation notification outside the database transaction’s atomicity boundary so notification delivery does not make a partially committed invitation state.
4. **Accept invitation endpoint:** Require an authenticated recipient whose email matches the invitation. Verify that the invitation is `PENDING` and unexpired, atomically transition it to `ACCEPTED` so the token cannot be replayed, create the membership, and record audit/activity events.
5. **Expiry handling:** Reject expired invitations during acceptance and mark overdue `PENDING` records as `EXPIRED`.
6. **Revoke invitation endpoint:** Re-check the caller’s current owner/admin role, transition a pending invitation to `REVOKED`, and write an audit entry.

## Edge Cases and Security Checks

- The invitee is already a member: reject the invitation request with `409`.
- A pending invitation already exists for the same team and email: reject the duplicate with `409`, backed by the uniqueness rule.
- The inviter is demoted before a management action: check the caller’s live role when creating or revoking an invitation rather than trusting an earlier role snapshot.
- An invitation is accepted after expiry: reject it and mark the pending record expired.
- A token is replayed: the single-use state transition must make a second acceptance fail.
- A token is forwarded: bind acceptance to the authenticated account whose email matches the intended recipient.

No application code was generated or edited for this exercise.
