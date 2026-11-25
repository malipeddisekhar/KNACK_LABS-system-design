# Module 06: Parallel Execution — Break Diagnosis (The Rogue Agent)

## 1. Scenario Presentation
Both agents completed their tickets with 100% passing tests in their isolated branches:
- **Agent Alpha:** Produced the Provider Catalog API.
- **Agent Beta:** Produced the Booking Creation Endpoint.

However, when comparing Agent Beta's actual response output against the binding **Interface Contract** (`artifacts/contracts/module-06-interface-contracts.md`), a critical contract violation was discovered.

---

## 2. Systematic Contract Diff & Forensic Identification

### Field-by-Field Diff Table:

| Contract Property | Contract Specification | Agent Beta's Actual Output | Match? | Severity |
|---|---|---|:---:|:---:|
| `bookingId` | String (RFC 4122 UUID v4) | `"c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33"` | **MATCH** | None |
| `providerId` | String (RFC 4122 UUID v4) | `"a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11"` | **MATCH** | None |
| `slotId` | String (RFC 4122 UUID v4) | `"b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22"` | **MATCH** | None |
| `userId` | String | `"anon-user-001"` | **MATCH** | None |
| **`status`** | Enum: `"confirmed" \| "failed"` (lowercase) | **`"CONFIRMED"` (uppercase)** | **VIOLATION** | **CRITICAL** |
| **`createdAt`** | Strict ISO-8601 UTC String (`"YYYY-MM-DDTHH:mm:ss.sssZ"`) | `1710512400` *(Unix epoch integer)* | **VIOLATION** | **HIGH** |

---

## 3. The Root Causes & Downstream Blast Radius

### Violation 1: Enum Value Casing Mismatch (`"CONFIRMED"` vs `"confirmed"`)
- **What happened:** Agent Beta justified uppercase casing because "Prisma enums and SQL conventions are uppercase by default."
- **Why tests passed in isolation:** Agent Beta wrote its unit tests asserting against its own internal TypeScript enum:
  `expect(res.body.status).toBe(BookingStatus.CONFIRMED);` (Passed!).
- **Why integration crashes:**
  The frontend client (Agent Gamma) followed the contract and implemented:
  ```typescript
  if (booking.status === "confirmed") {
    renderSuccessScreen();
  } else {
    renderUnknownStatusWarning();
  }
  ```
  In JavaScript, `"CONFIRMED" === "confirmed"` is strictly `false`. Every single student booking appears to the user as an unknown or failed transaction, triggering customer support tickets and panic.

### Violation 2: Timestamp Type Divergence (Unix Integer vs ISO String)
- **What happened:** Agent Beta converted `createdAt` to a Unix integer (`1710512400`) claiming it saved bytes over the wire.
- **Why integration crashes:**
  The frontend and analytics services parse `booking.createdAt.substring(0, 10)` or `new Date(booking.createdAt)`. Passing an integer where an ISO string was contracted causes `TypeError: booking.createdAt.substring is not a function`, crashing the client UI thread.

---

## 4. Key Takeaways
1. **Individual Correctness != System Correctness:** An agent can have 100% test coverage and zero linter warnings on its branch while remaining 100% incompatible with the rest of the architecture.
2. **The Coordinator's Role:** Finding this divergence before merging into `main` proves the power of **Checkpoint Synchronization** over end-only integration.
