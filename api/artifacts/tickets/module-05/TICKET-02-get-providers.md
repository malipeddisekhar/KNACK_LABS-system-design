# TICKET-02: GET /api/v1/providers — List Active Providers with Slot Previews

## 1. Title
`TICKET-02: GET /api/v1/providers — List Active Providers with Slot Previews [AI-READY]`

## 2. Context (Why)
The homepage directory is the primary entry point for prospective students. This endpoint returns the active marketplace providers along with their next 3 available time slots so students can browse mentors and immediately see appointment availability without making secondary network calls.

## 3. Scope (What)
- Implement `GET /api/v1/providers` in `src/providers/providers.controller.ts`.
- Query active providers from the database, eagerly including only slots where `is_booked = false` and `start_time > now()`, ordered by `start_time ASC` (limit 3 slots per provider).
- Transform records into the typed `ProviderListResponseDto`.

## 4. Interface Contract (Inputs / Outputs / Data Shapes)
- **HTTP Method:** `GET`
- **Path:** `/api/v1/providers`
- **Request Headers:** None (Public anonymous endpoint).
- **Query Parameters:** None for Slice 1.
- **Success Response (200 OK):**
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
- **Error Response (500 Internal Server Error):**
```json
{
  "statusCode": 500,
  "message": "Internal server error occurred while retrieving providers.",
  "timestamp": "2026-11-24T16:15:00.000Z"
}
```

## 5. Acceptance Criteria (Given / When / Then)
- **Scenario 1: Retrieve Provider Catalog**
  - **Given** the database contains 3 seeded active providers with open slots,
  - **When** an anonymous user makes a `GET` request to `/api/v1/providers`,
  - **Then** the response status is `200 OK`, `meta.total` equals 3, and each provider contains an `availableSlots` array containing only unbooked future slots.
- **Scenario 2: Exclude Booked Slots from Preview**
  - **Given** a provider has 3 slots, but 1 slot has `is_booked = true`,
  - **When** `GET /api/v1/providers` is called,
  - **Then** only the 2 unbooked slots are returned in `availableSlots`.
- **Scenario 3: Response Structure Compliance**
  - **Given** any successful response,
  - **When** the payload is inspected,
  - **Then** `hourlyRate` is a floating-point number formatted to two decimals, and `startTime` is formatted as an ISO-8601 UTC string.

## 6. Constraints
- Framework: NestJS controller/service architecture.
- Database: Use the existing Prisma/PostgreSQL connection via dependency injection (`PrismaService`).
- Security: Publicly accessible; no authentication guards.
- Performance: Maximum response time under 100ms p95.

## 7. Anti-Scope
- No keyword search query parameter (`?search=...`).
- No category filtering query parameter (`?category=...`).
- No cursor or offset pagination (returns all active providers, fixed at 3 for Slice 1).
- No provider self-registration or profile update capabilities.
