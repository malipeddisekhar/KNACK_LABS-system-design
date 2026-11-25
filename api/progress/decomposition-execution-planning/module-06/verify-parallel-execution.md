# Module 06: Parallel Execution — Verification & Scenario Tracing

## 1. Interface Contract Verification Audit

### 1. Identifier Format
- **Location in Contract:** Section 1 (*Universal Data Invariants*), Page 1.
- **Specification:** `"All resource identifiers (providerId, slotId, bookingId) MUST be RFC 4122 UUID v4 strings."`
- **Verification in Code:** Stream B enforces `@IsUUID('4')` via class-validator; Stream A generates UUIDs via PostgreSQL/Prisma `@default(uuid())`.

### 2. Error Response Format
- **Location in Contract:** Sections 2 and 3 (*Error Contracts*).
- **Specification:** Standard NestJS error payload:
  `{ "statusCode": number, "message": string | string[], "error"?: string, "timestamp": string }`.
- **Verification in Code:** Stream B uses built-in NestJS HTTP exceptions (`NotFoundException`, `ConflictException`, `BadRequestException`), ensuring JSON error serialization matches the contract.

### 3. Datetime Format
- **Location in Contract:** Section 1 (*Universal Data Invariants*).
- **Specification:** `"All timestamps (startTime, endTime, createdAt) MUST be strict ISO-8601 UTC strings formatted with milliseconds and trailing Z (e.g., '2026-11-25T10:00:00.000Z')."`
- **Verification in Code:** Eliminates timezone ambiguity (preventing Mars Climate Orbiter unit mismatch failures).

### 4. Field Asymmetry Audit
- **Question:** *Is there any field that one agent produces but the other agent does not consume? Why is it there?*
- **Audit Finding:** In Contract 1 (`GET /api/v1/providers`), Stream A produces `meta.total`, `averageRating`, and `headline`. Stream B's booking endpoint does not consume these fields.
- **Justification:** These fields are consumed by **Stream C (Frontend UI)** for catalog browsing, star rating display, and search result ranking. The transaction boundary with Stream B requires only `providerId` and `slotId`. The asymmetry is deliberate and correctly partitioned.

---

## 2. End-to-End Concrete Scenario Tracing: Sarah Books Mike

### Scenario Narrative:
Sarah wants to book plumbing mentorship with Mike. She visits SkillSwap, finds Mike's profile, inspects his Tuesday 2:00 PM slot, and confirms the appointment.

### Step-by-Step Code Trace Across Workstreams:

#### 1. Catalog & Slot Display (Stream A: Agent Alpha)
- **Action:** Sarah's browser initiates `GET /api/v1/providers`.
- **Handler:** `ProvidersController.getActiveProviders()` calls `ProvidersService.findActiveProvidersWithSlots()`.
- **Query:** Eagerly loads providers where `isActive = true`, joining open slots where `isBooked = false` and `startTime > now()`.
- **Response Payload:** Returns Mike's provider card containing `availableSlots`:
  ```json
  {
    "id": "e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a99",
    "fullName": "Mike The Plumber",
    "category": "HOME_SERVICES",
    "hourlyRate": 60.00,
    "availableSlots": [
      {
        "slotId": "f5eebc99-9c0b-4ef8-bb6d-6bb9bd380b88",
        "startTime": "2026-11-25T14:00:00.000Z",
        "endTime": "2026-11-25T15:00:00.000Z"
      }
    ]
  }
  ```

#### 2. Booking Submission (Stream C: Agent Gamma -> Stream B: Agent Beta)
- **Action:** Sarah selects Tuesday 2:00 PM and clicks "Confirm Booking".
- **Client Execution (Stream C):** `submitBooking(mikeId, slotId)` constructs `POST /api/v1/bookings` body:
  ```json
  {
    "providerId": "e4eebc99-9c0b-4ef8-bb6d-6bb9bd380a99",
    "slotId": "f5eebc99-9c0b-4ef8-bb6d-6bb9bd380b88",
    "userId": "sarah-user-123",
    "notes": "Need help diagnosing water pressure valve"
  }
  ```

#### 3. Transactional Processing (Stream B: Agent Beta)
- **Handler:** `BookingsController.createBooking()` validates `CreateBookingDto`.
- **Atomic Execution:** `BookingsService` enters `prisma.$transaction`:
  1. Reads `tx.slot.findUnique({ where: { id: dto.slotId } })`.
  2. Asserts `slot.isBooked === false`.
  3. Atomically sets `slot.isBooked = true`.
  4. Inserts `Booking` row with status `CONFIRMED`.
- **Response:** Returns `201 Created` with `bookingId: "c2eebc99-..."`.

#### 4. Concurrency Collision Handling (Race Condition Guard)
- **Question:** *What happens if another student books Tuesday at 2:00 PM while Sarah is looking at her screen?*
- **Trace:**
  - The other student's transaction commits first, setting slot `isBooked = true`.
  - When Sarah clicks "Confirm", Sarah's transaction reads `slot.isBooked === true`.
  - `BookingsService` throws `ConflictException('Selected time slot is already booked')`.
  - NestJS returns `HTTP 409 Conflict`:
    ```json
    {
      "statusCode": 409,
      "message": "Selected time slot is already booked",
      "error": "Conflict"
    }
    ```
  - Sarah's client (Stream C) catches the 409 status code and displays an alert: *"This slot was just booked by another user. Please choose another time."*
  - **Audit Verdict:** The contract explicitly covers this race condition, and both backend and frontend handle it gracefully.

---

## 3. Seeded Contract Violation Detection (Checkpoint 1 Audit)

During the Checkpoint 1 audit of `artifacts/parallel/module-06-agent-output-bundle.md`:
- **Discrepancy Detected:** Agent Alpha (Stream A) emitted snake_case field names (`slot_id`, `start_time`, `end_time`) inside `availableSlots` in `ProvidersController`.
- **Downstream Consequence:** Stream C (Frontend) expected `slot.slotId`. In JavaScript, reading `slot.slotId` from `{ slot_id: "..." }` evaluates to `undefined`. When Stream C submitted `slotId: undefined`, Stream B's class-validator rejected the request with `400 Bad Request: ["slotId must be a UUID"]`.
- **Resolution:** By catching this at Checkpoint 1, the coordinator intercepted the divergence immediately. Stream A was instructed to add a class-transformer serializer enforcing camelCase (`slotId`, `startTime`, `endTime`) prior to merging.
