
## UPSK BUILD Advancement Connection Incident

- **Attempt time:** 2026-11-22 09:15:21 UTC (`timestamp_unix_ms: 1795338555025`).
- **CLI version:** `0.1.30`.
- **Failed commands:** `upsk next` and `upsk status --json`; both returned `Cannot reach UPSK server at api.upsk.to (connection; source: default)`.
- **Saved `last_error.json`:** stale; it records an earlier `409 SESSION_DECISION_REQUIRED`, not this connection attempt. Earlier IDs: correlation `upsk-corr-1a1fe9ec22a-1`, request `b6a1b4d6-7258-4bec-972c-df7f9fcf9a0f`, error `err_f62f773d20b64349a393c4d7`.
- **Reachability:** The browser check could not access the health endpoint, so it did not establish whether `api.upsk.to` is down or a local DNS/proxy/firewall/VPN/network rule blocks the connection.
- **Checkpoint:** Advancement from Module 2 BUILD is unconfirmed.

## UPSK BUILD Advancement Retry

- **Command:** `upsk --api-url https://api.upsk.to status` (single explicit-URL check).
- **Result:** Failed at `timestamp_unix_ms: 1795339161757` with `Cannot reach UPSK server at api.upsk.to (connection; source: --api-url)`. Exit status was `1`.
- **CLI output:** `{"timestamp_unix_ms":1795339161757,"level":"error","message":"command.failed","context":{"command":"status"}}`; `Error: Cannot reach UPSK server at api.upsk.to (connection; source: --api-url). Check DNS, proxy, firewall, or VPN.`
- **Action:** No `upsk next` was run because status did not succeed. The active server checkpoint and next prompt remain unconfirmed.
- **Scope:** This turn changed progress notes only; `src/teams/` and `prisma/` were not modified.
