# TICKET-03: POST /api/v1/bookings — Create Confirmed Booking with Slot Mutex

## 1. Title
`TICKET-03: POST /api/v1/bookings — Create Confirmed Booking with Slot Mutex [AI-READY - HARDENED]`

## 2. Context (Why)
This endpoint handles the core transactional value exchange of SkillSwap. When a student chooses a time slot, this handler atomically locks the slot, checks for conflicts, and issues a confirmed booking, preventing race conditions, double-bookings, and replay attacks.

## 3. Scope (What)
- Implement `POST /api/v1/bookings` in `src/bookings/bookings.controller.ts` with business logic in `src/bookings/bookings.service.ts`.
- Validate ingress payload using `class-validator` DTO (`CreateBookingDto`) with strict XSS sanitization.
- Support optional `Idempotency-Key` header to safely handle network retries.
- In an atomic database transaction using `PrismaService`:
  1. Verify the slot exists and belongs to the specified `providerId`.
  2. Verify `slot.isBooked === false` and `slot.startTime > now()`.
  3. Atomically update slot `isBooked = true`.
  4. Create a new `Booking` record with status `CONFIRMED`.
- Emit structured audit log on booking creation.
- Return `201 Created` with the persisted booking entity.

## 4. Interface Contract (Inputs / Outputs / Data Shapes)
- **HTTP Method:** `POST`
- **Path:** `/api/v1/bookings`
- **Headers:**
  - `Content-Type: application/json`
  - `Idempotency-Key: <uuid>` *(optional, recommended for client retries)*
- **Request Body (`CreateBookingDto`):**
```json
{
  "providerId": "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
  "slotId": "b1eebc99-9c0b-4ef8-bb6d-6bb9bd380a22",
  "userId": "anon-user-001",
  "notes": "Looking forward to calculus prep"
}
```
- **Validation Rules (`class-validator`):**
  - `@IsUUID('4') @IsNotEmpty() providerId: string;`
  - `@IsUUID('4') @IsNotEmpty() slotId: string;`
  - `@IsString() @IsNotEmpty() @MaxLength(100) userId: string;`
  - `@IsOptional() @IsString() @MaxLength(500) @Matches(/^[^<>]*$/, { message: 'notes cannot contain HTML tags' }) notes?: string;`

- **Prisma Schema Contract:**
```prisma
enum BookingStatus {
  CONFIRMED
  CANCELLED
  COMPLETED
}

model Slot {
  id         String    @id @default(uuid())
  providerId String
  startTime  DateTime
  endTime    DateTime
  isBooked   Boolean   @default(false)
  provider   Provider  @relation(fields: [providerId], references: [id])
  booking    Booking?
}

model Booking {
  id             String        @id @default(uuid())
  providerId     String
  slotId         String        @unique
  userId         String
  notes          String?
  idempotencyKey String?       @unique
  status         BookingStatus @default(CONFIRMED)
  createdAt      DateTime      @default(now())
  slot           Slot          @relation(fields: [slotId], references: [id])
}
```

- **Success Response (201 Created):**
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

- **Error Responses (Standard NestJS Format):**
  - `400 Bad Request`: Validation failure on input fields or HTML tags in notes:
    ```json
    {
      "statusCode": 400,
      "message": ["notes cannot contain HTML tags"],
      "error": "Bad Request"
    }
    ```
  - `404 Not Found`: Provider or Slot ID does not exist:
    ```json
    {
      "statusCode": 404,
      "message": "Slot not found",
      "error": "Not Found"
    }
    ```
  - `409 Conflict`: Slot is already booked:
    ```json
    {
      "statusCode": 409,
      "message": "Selected time slot is already booked",
      "error": "Conflict"
    }
    ```
  - `429 Too Many Requests`: Triggered if client exceeds 10 booking attempts per minute.
  - `500 Internal Server Error`: Caught and sanitized by global `AllExceptionsFilter` (stack traces redacted).

## 5. Acceptance Criteria (Given / When / Then)
- **Scenario 1: Successful Booking & Audit Log**
  - **Given** an open, unbooked slot exists in the database,
  - **When** client sends `POST /api/v1/bookings` with valid `providerId`, `slotId`, and `userId`,
  - **Then** status is `201 Created`, slot `isBooked` is set to `true`, and an INFO audit log is recorded containing `event: "booking.created"`, `bookingId`, `providerId`, and `userId`.
- **Scenario 2: Double-Booking Prevention (Concurrency Guard)**
  - **Given** a slot has already been booked (`isBooked = true`),
  - **When** a second client sends `POST /api/v1/bookings` for the same `slotId`,
  - **Then** system rejects request with `409 Conflict` and error `"Selected time slot is already booked"`.
- **Scenario 3: Idempotent Client Retry**
  - **Given** a successful booking was created with `Idempotency-Key: "550e8400-e29b-41d4-a716-446655440000"`,
  - **When** the client resends the exact same request with that `Idempotency-Key` within 5 minutes,
  - **Then** status is `200 OK` (or `201 Created`) returning the original booking record without creating a duplicate.
- **Scenario 4: XSS Input Sanitization**
  - **Given** a payload containing `<script>alert('xss')</script>` in the `notes` field,
  - **When** client sends `POST /api/v1/bookings`,
  - **Then** system rejects request with `400 Bad Request` naming the invalid characters.
- **Scenario 5: Missing or Malformed Properties**
  - **Given** a payload missing `providerId` or containing a non-UUID string,
  - **When** client sends `POST /api/v1/bookings`,
  - **Then** system returns `400 Bad Request`.

## 6. Constraints & Cross-Cutting Standards Compliance
- **Authentication/Identity:** Public endpoint for Slice 1 MVP (`userId` passed in body); Slice 2 will enforce `@UseGuards(JwtAuthGuard)` and derive `userId = req.user.id`.
- **Rate Limiting:** Regulated by global throttler (`@Throttle({ default: { limit: 10, ttl: 60000 } })`).
- **Database & Concurrency:** Use `PrismaService` interactive transaction: `await this.prisma.$transaction(async (tx) => { ... })`.
- **Error Handling:** Rely on global `AllExceptionsFilter`; never expose raw SQL/DB stack traces in responses.
- **Logging:** Use application `Logger` (`this.logger.log({ event: 'booking.created', ... })`).

## 7. Anti-Scope
- No payment gateway / Stripe processing in this ticket.
- No asynchronous email or SMS notification jobs.
- No calendar synchronization (Google Calendar / iCal).
- No booking cancellation or rescheduling logic.
