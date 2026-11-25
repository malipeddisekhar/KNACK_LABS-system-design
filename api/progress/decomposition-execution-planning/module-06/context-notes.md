# Module 06: Parallel Execution — Context Notes

## Micro-Exercise: Parallel Work & Interface Contracts

### Given Tickets:
1. **Ticket A:** Build the provider availability API (providers set their open time slots).
2. **Ticket B:** Build the booking creation API (users book a provider's time slot).
3. **Ticket C:** Build the provider profile page (frontend displays provider info, ratings, services).
4. **Ticket D:** Build the email notification service (sends booking confirmations).

---

### 1. Which 2 tickets can run simultaneously right now? Why?
- **Pair:** **Ticket A (Backend Availability API) & Ticket C (Frontend Provider Profile Page)**.
  - *Why:* They operate on different architectural layers (Backend data logic vs. Frontend UI presentation). The frontend developer building the profile page does not need a live backend server running; they only need the agreed-upon interface contract (data shape). Frontend builds against mock JSON fixtures matching the contract while the backend developer constructs the database queries and validation.
- *(Alternative Pair: Ticket B and Ticket D)*: Ticket B (Booking creation) and Ticket D (Notification worker) can also run in parallel across two backend developers IF they agree upfront on the `BookingConfirmedEvent` schema passed via message bus.

---

### 2. Which 2 tickets CANNOT run simultaneously? What is the dependency?
- **Pair:** **Ticket A (Provider Availability API) & Ticket B (Booking Creation API)** cannot run simultaneously without serialization or a strictly pre-locked database schema.
  - *The Dependency:* **Data Model & State Mutex Dependency.** Ticket B directly consumes, verifies, and mutates the time slots created by Ticket A. A student cannot book an appointment if the system has not defined how time slots are identified (UUID vs integer), how timezone intervals are represented (UTC ISO timestamps vs local time strings), and how slot availability is flagged (`isBooked: boolean` vs `status: AVAILABLE | RESERVED`). Ticket B has a hard structural dependency on Ticket A's persistence design.

---

### 3. What is the contract between the 2 parallel tickets (Ticket A & Ticket C)?
To guarantee that Ticket A and Ticket C integrate on the first attempt without type mismatches or UI rework, both developers must commit to the shared **`ProviderProfileWithSlotsContract`**:

```typescript
// Shared Interface Contract: Provider & Slot Read Model
export interface ProviderProfileWithSlotsContract {
  id: string; // UUID v4 format
  fullName: string;
  category: "MATH_TUTORING" | "MUSIC" | "PROGRAMMING";
  headline: string;
  bio: string;
  hourlyRate: number; // Two decimal float, e.g. 40.00
  averageRating: number; // One decimal float, e.g. 4.9
  services: Array<{
    id: string; // UUID v4
    title: string;
    durationMinutes: number; // e.g. 60
  }>;
  availableSlots: Array<{
    slotId: string; // UUID v4
    startTime: string; // Strict ISO-8601 UTC string (e.g. "2026-11-25T10:00:00.000Z")
    endTime: string;   // Strict ISO-8601 UTC string (e.g. "2026-11-25T11:00:00.000Z")
  }>;
}
```

### The Synchronization Point:
The synchronization point occurs when the Frontend dev (Ticket C) flips their API client from local mock fixtures to the live endpoint `GET /api/v1/providers/:id`. Because both developers honored the exact field names, casing (`camelCase`), ID types (`UUID v4`), and timestamp formats (`ISO-8601 UTC`), integration is instant and zero-friction.
