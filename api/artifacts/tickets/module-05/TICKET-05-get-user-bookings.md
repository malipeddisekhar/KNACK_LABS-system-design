# TICKET-05: GET /api/v1/users/me/bookings — User Booking History Dashboard

## 1. Title
`TICKET-05: GET /api/v1/users/me/bookings — User Booking History Dashboard`

## 2. Context (Why)
Once students book sessions, they need a single view to see all upcoming and completed appointments. This ticket implements the authenticated endpoint powering the "My Bookings" student dashboard in Slice 2.

## 3. Scope (What)
- Implement `GET /api/v1/users/me/bookings` in `src/users/users.controller.ts`.
- Protect endpoint with `JwtAuthGuard` (extracting `req.user.id`).
- Query database for all bookings where `userId === req.user.id`, joining associated `provider` and `slot` details.
- Order appointments chronologically by `slot.startTime DESC`.

## 4. Interface Contract (Inputs / Outputs / Data Shapes)
- **HTTP Method:** `GET`
- **Path:** `/api/v1/users/me/bookings`
- **Headers:** `Cookie: auth_token=<jwt>` (or `Authorization: Bearer <jwt>`)
- **Success Response (200 OK):**
```json
{
  "data": [
    {
      "bookingId": "c2eebc99-9c0b-4ef8-bb6d-6bb9bd380a33",
      "status": "CONFIRMED",
      "createdAt": "2026-11-24T16:20:00.000Z",
      "provider": {
        "id": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        "fullName": "Alice Walker",
        "category": "MATH_TUTORING"
      },
      "session": {
        "startTime": "2026-11-25T10:00:00.000Z",
        "endTime": "2026-11-25T11:00:00.000Z"
      }
    }
  ]
}
```
- **Error Response (401 Unauthorized):**
```json
{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

## 5. Acceptance Criteria (Given / When / Then)
- **Scenario 1: Authenticated User with Bookings**
  - **Given** an authenticated user with 2 bookings,
  - **When** user sends `GET /api/v1/users/me/bookings`,
  - **Then** status is `200 OK`, and response array contains both bookings with populated provider and session details.
- **Scenario 2: Authenticated User with No Bookings**
  - **Given** a newly registered user with zero bookings,
  - **When** user sends `GET /api/v1/users/me/bookings`,
  - **Then** status is `200 OK`, and `data` is an empty array `[]`.
- **Scenario 3: Unauthenticated Request**
  - **Given** a request without an auth cookie or token,
  - **When** `GET /api/v1/users/me/bookings` is requested,
  - **Then** status is `401 Unauthorized`.

## 6. Constraints
- Strictly filter bookings by authenticated caller ID; students must never see another student's appointments.
- Eager load provider name and category to avoid N+1 query patterns.

## 7. Anti-Scope
- No appointment cancellation action (handled in Slice 5).
- No post-session review submission form (handled in Slice 5).
- No provider dashboard views (providers see their calendar in Slice 3).
