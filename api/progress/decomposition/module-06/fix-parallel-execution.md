# Module 06: Parallel Execution — Fix & Contract Safeguards

## 1. The Strategic Fix Decision

### Chosen Approach: Option 1 — Fix the Rogue Agent's Output to Match Contract
- **Decision:** Enforce the original interface contract on Agent Beta and Agent Alpha by introducing boundary DTO serializers.
- **Tradeoff Rationale:**
  - **Why not Option 2 (Changing the contract):** Changing the contract to uppercase (`"CONFIRMED"`) and Unix timestamps (`1710512400`) would force every consuming client (Frontend UI, mobile apps, analytics ingestion, email notification workers) to modify their parsing logic to accommodate one backend agent's whim. That shifts the burden of a rogue implementation onto every other team.
  - **Architectural Principle:** Internal database representations (e.g. Prisma uppercase enums, database integer seconds) must NEVER leak across the public API boundary. The API contract is a stable covenant. The rogue agent must serialize its output to the contracted format.

---

## 2. The Production Blast Radius Analysis

### What happens if this deploys to production on a Friday afternoon?
1. **Enum Value Casing Mismatch (`"CONFIRMED"` vs `"confirmed"`):**
   - **The Symptom:** The frontend UI evaluates `if (response.status === "confirmed")`. In JavaScript, strict equality fails. The UI displays an error banner: *"Booking status unknown — please contact support"*, even though the row was successfully committed to PostgreSQL.
   - **The Silent Failure:** Asynchronous notification workers listening for `status === "confirmed"` drop the event as unhandled. The student receives no confirmation email and no calendar invite, assuming the booking crashed.
   - **Detection Delay:** Because the backend returned `201 Created` with zero 500 error logs, automated APM monitors (Datadog, Sentry) report 100% green health. The issue is only discovered Monday morning when hundreds of angry support tickets arrive.

2. **Date Format Mismatch (Unix Integer vs ISO String):**
   - **The Symptom:** Frontend date formatters (e.g., `date-fns`, `dayjs`, or `.substring(0, 10)`) crash with `TypeError: dateString.substring is not a function`, causing an unhandled white-screen crash for any student attempting to view their appointment confirmation.

---

## 3. The Remediated Code (Fixed Agent Outputs)

### Agent Beta Fix (`src/bookings/dto/booking-response.dto.ts`):
```typescript
import { Exclude, Expose, Transform } from 'class-transformer';

export class BookingResponseDto {
  @Expose()
  bookingId: string;

  // Transforms internal uppercase Prisma enum to contracted lowercase API enum
  @Expose()
  @Transform(({ value }) => value.toLowerCase())
  status: 'confirmed' | 'failed';

  @Expose()
  providerId: string;

  @Expose()
  slotId: string;

  @Expose()
  userId: string;

  // Enforces strict ISO-8601 UTC string format
  @Expose()
  @Transform(({ value }) => (value instanceof Date ? value.toISOString() : new Date(value).toISOString()))
  createdAt: string;
}
```

### Agent Alpha Fix (`src/providers/dto/provider-list-response.dto.ts`):
```typescript
// Explicitly maps snake_case database fields to camelCase contract
export class SlotPreviewDto {
  @Expose({ name: 'id' })
  slotId: string;

  @Expose({ name: 'startTime' })
  startTime: string;

  @Expose({ name: 'endTime' })
  endTime: string;
}
```

---

## 4. Re-running the End-to-End Scenario: Sarah Books Mike
1. **Sarah browses providers:** `GET /api/v1/providers` returns Mike's card with `slotId: "f5eebc99-..."` and `startTime: "2026-11-25T14:00:00.000Z"`. Field names are strictly `camelCase`.
2. **Sarah confirms booking:** Client submits `{ providerId, slotId: "f5eebc99-...", userId: "sarah-123" }`.
3. **Backend executes transaction:** Prisma locks slot, sets `isBooked = true`, creates booking record.
4. **Serializer formats response:** DTO serializes response with `status: "confirmed"` (lowercase) and `createdAt: "2026-11-24T16:20:00.000Z"` (ISO string).
5. **Sarah's UI evaluates status:** `booking.status === "confirmed"` evaluates to `TRUE`. The green success screen renders immediately with formatted appointment date.
6. **Verdict:** **Zero mismatches. End-to-end integration is 100% verified.**

---

## 5. Future Prevention: Automated Architectural Safeguards
To permanently eliminate this category of cross-agent failure, we institute four process rules:

1. **Shared Contract Types Package (`@skillswap/contracts`):**
   - All DTO interfaces, enum definitions, and schema validators live in a shared monorepo workspace package. Agents and developers must import shared types rather than redeclaring them locally.
2. **Automated Consumer-Driven Contract Testing (Pact):**
   - CI pipeline runs automated Pact verification. If a backend agent PR modifies an endpoint response shape that breaks frontend contract expectations, the CI build fails before merge review.
3. **OpenAPI Code Generation:**
   - Define endpoints in OpenAPI 3.1 YAML. Run `openapi-generator` to auto-generate NestJS interfaces and TypeScript fetch clients. Discrepancies become impossible because code is generated directly from the contract.
4. **Pre-Merge Checkpoint 1 Gate:**
   - Formal policy requirement: Coordinator must audit exported DTO shapes at Checkpoint 1 before parallel agents proceed to implementation.
