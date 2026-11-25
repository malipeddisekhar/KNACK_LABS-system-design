# Module 08 Fix: Resolving the Status Enum Seam and Engineering Systemic Prevention

## 1. Evaluation of Fix Options

| Option | Approach | Trade-off Analysis | Verdict |
|---|---|---|---|
| **Option 1** | Change Booking Service to emit `active` | **Flawed:** A newly created booking is in the "confirmed" state awaiting its future session time; "active" semantically implies an in-progress or ongoing call. Conflating reservation state with runtime session state creates semantic confusion. | **REJECTED** |
| **Option 2** | Change Dashboard to filter for `confirmed` | **Pragmatic Hotfix:** Immediately resolves the bug by aligning the dashboard query with the booking engine's output. However, it leaves both teams vulnerable to future semantic drift if done via raw string literals. | **ACCEPTED (Immediate Patch)** |
| **Option 3** | Establish Canonical Shared Status Enum (`@skillswap/contracts`) | **Systemic Architectural Solution:** Defines a formal domain lifecycle enum imported as a single source of truth across all services, repositories, and UI apps. Eliminates string literal drift permanently. | **ACCEPTED (Canonical Architecture)** |

---

## 2. The Implementation: Immediate Patch + Canonical Definition

### Immediate Patch in `ProviderDashboardService`:
```typescript
// Immediate query hotfix: Include confirmed reservations in the upcoming schedule
async getUpcomingBookings(providerId: string) {
  return this.prisma.booking.findMany({
    where: {
      slot: { providerId },
      status: { in: [BookingStatus.CONFIRMED, BookingStatus.IN_PROGRESS] },
    },
    orderBy: { slot: { startTime: 'asc' } },
  });
}
```

### The Systemic Architecture: Shared Domain Lifecycle
Published in `@skillswap/contracts`:
```typescript
export enum BookingStatus {
  PENDING = 'pending',       // Awaiting payment authorization
  CONFIRMED = 'confirmed',   // Escrow held, slot reserved, awaiting session time
  IN_PROGRESS = 'in_progress', // Session actively occurring
  COMPLETED = 'completed',   // Session delivered, escrow released to provider
  CANCELLED = 'cancelled',   // Cancelled prior to start, refund processed
  NO_SHOW = 'no_show',       // Learner or provider failed to attend
}

export const VISIBLE_PROVIDER_SCHEDULE_STATUSES = [
  BookingStatus.CONFIRMED,
  BookingStatus.IN_PROGRESS,
] as const;
```

---

## 3. Four Systemic Prevention Mechanisms

To eliminate this entire class of bugs across the organization:

1. **Shared Compiled Types Package (`@skillswap/contracts`):**
   - Zero raw string literals allowed for domain statuses or entity states.
   - Both producer and consumer packages import the compiled `BookingStatus` enum and `VISIBLE_PROVIDER_SCHEDULE_STATUSES` constant. TypeScript compiler flags any arbitrary string literal as a compile-time error.
2. **Automated Consumer-Driven Contract Testing (Pact):**
   - The provider dashboard service defines a consumer pact: *"When I query for upcoming bookings, I expect records with status `confirmed`."*
   - In CI, the booking service's provider verification tests must prove it satisfies the dashboard's pact before its branch can be merged into `main`.
3. **Automated Cross-Component CI Smoke Suite (`INT-TEST-01` to `04`):**
   - The integration test plan authored in Phase 5 executes automatically on every release candidate.
   - `INT-TEST-01` explicitly verifies that a created booking appears in the provider dashboard query output within the same automated test run.
4. **OpenAPI Schema Diffing & Compatibility Gate:**
   - Every service publishes an OpenAPI 3.1 specification on commit.
   - A central CI job runs `openapi-diff` between services to detect enum property drift or breaking schema changes before deployment to staging.

---

## 4. Proactive Audit: Finding Hidden Semantic Mismatches
When asked *"How many more of these could be hiding right now?"*, we do not wait for user bug reports. We execute a 3-step proactive audit:

1. **Repository-Wide String Literal Grep:**
   - Search for raw string comparisons on status fields across all controllers and services:
     `git grep -E "status ===|status =|status: '" -- '*.ts'`
   - Flag any string literal not referencing an enum from `@skillswap/contracts`.
2. **Database Constraint Audit:**
   - Verify that all database columns representing state use native PostgreSQL enums (`CREATE TYPE booking_status AS ENUM (...)`) rather than unconstrained `VARCHAR(255)`. This ensures that attempting to write an unrecognized status like `"active"` fails fast with a database integrity error.
3. **Synthetic End-to-End Persona Drills:**
   - Automated synthetic agents run Sarah & Mike's complete lifecycle every 15 minutes in staging, asserting that state changes in one service propagate to all downstream viewers.
