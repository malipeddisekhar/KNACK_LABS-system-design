# Module 06: Interface Contracts Specification

## 1. Overview & Universal Standards
This document establishes the binding interface contracts governing parallel development streams for SkillSwap. All agents and developers must strictly adhere to the types, casing, field names, and status codes specified below.

### Universal Data Invariants:
- **Identifier Format:** All resource identifiers (`providerId`, `slotId`, `bookingId`) MUST be RFC 4122 UUID v4 strings.
- **Timestamp Format:** All timestamps (`startTime`, `endTime`, `createdAt`) MUST be strict ISO-8601 UTC strings formatted with milliseconds and trailing `Z` (e.g., `"2026-11-25T10:00:00.000Z"`). Unix timestamps or local strings are prohibited.
- **Casing Standard:** JSON payload keys and TypeScript interface properties MUST use `camelCase`. Database column mappings to SQL tables are encapsulated within the persistence layer.
- **Monetary Values:** Monetary amounts in client APIs MUST be numbers with 2 decimal precision (e.g. `40.00`). Internal database values use integer cents (`4000`).

---

## 2. Contract 1: Provider Catalog (`GET /api/v1/providers`)
- **Producer:** Stream A (Agent Alpha - `feat/provider-catalog`)
- **Consumer:** Stream C (Agent Gamma - `feat/frontend-booking`)

### Endpoint Signature:
- `GET /api/v1/providers`
- Query Params: None in Slice 1.

### Response Contract (200 OK):
```json
{
  "data": [
    {
      "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      "fullName": "Alice Walker",
      "category": "MATH_TUTORING",
      "headline": "Calculus & Linear Algebra Specialist",
      "hourlyRate": 40.00,
      "averageRating": 5.0,
      "availableSlots": [
        {
          "slotId": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
          "startTime": "2026-11-25T10:00:00.000Z",
          "endTime": "2026-11-25T11:00:00.000Z"
        }
      ]
    }
  ],
  "meta": {
    "total": 3
  }
}
```

### Error Contract:
```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "timestamp": "2026-11-24T16:20:00.000Z"
}
```

---

## 3. Contract 2: Booking Transaction (`POST /api/v1/bookings`)
- **Producer:** Stream B (Agent Beta - `feat/booking-engine`)
- **Consumers:** Stream C (Agent Gamma - `feat/frontend-booking`), Stream A (State Synchronization)

### Endpoint Signature:
- `POST /api/v1/bookings`
- Request Headers:
  - `Content-Type: application/json`
  - `Idempotency-Key: <uuid>` *(optional)*

### Ingress Payload Contract:
```json
{
  "providerId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "slotId": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "userId": "anon-user-001",
  "notes": "Introductory session"
}
```

### Egress Payload Contract (201 Created):
```json
{
  "bookingId": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
  "status": "CONFIRMED",
  "providerId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "slotId": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "userId": "anon-user-001",
  "createdAt": "2026-11-24T16:20:00.000Z"
}
```

### Error Contracts:
- **400 Bad Request:**
  ```json
  {
    "statusCode": 400,
    "message": ["slotId must be a UUID"],
    "error": "Bad Request"
  }
  ```
- **404 Not Found:**
  ```json
  {
    "statusCode": 404,
    "message": "Slot not found",
    "error": "Not Found"
  }
  ```
- **409 Conflict (Slot Mutex Collision):**
  ```json
  {
    "statusCode": 409,
    "message": "Selected time slot is already booked",
    "error": "Conflict"
  }
  ```

---

## 4. Synchronization Points
1. **Checkpoint 1 (Contract & DTO Freeze):**
   - Both backend agents export their DTO definitions (`ProviderListResponseDto`, `CreateBookingDto`, `BookingResponseDto`).
   - Coordinator verifies type signatures against this document.
2. **Checkpoint 2 (Mock Client Integration):**
   - Frontend agent runs integration tests using mock JSON fixtures matching Contract 1 and Contract 2.
   - Backend agents verify controller unit tests return payloads matching exact schema structures.
3. **Checkpoint 3 (Branch Merge & End-to-End Verification):**
   - Feature branches merge into `main`.
   - Live integration smoke test runs end-to-end.
