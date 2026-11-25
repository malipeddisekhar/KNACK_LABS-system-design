# Module 08 Continuous Integration Test Plan

## Overview
This document specifies the automated cross-component integration test suite designed to run on every pull request and release merge. It tests the highest-risk integration seams where components interface across boundaries.

---

## Cross-Component Test Suite

### Test 1: Provider Slot Discovery -> Atomic Booking Mutex Handoff
- **Test ID:** `INT-TEST-01`
- **Name:** Provider Slot Selection to Reservation Transaction
- **Components Involved:** Catalog Service (Stream A), Booking Service (Stream B), PostgreSQL Database.
- **Setup:** Database seeded with verified provider `prov_mike_01` possessing active slot `slot_react_101` (`status: "available"`).
- **Execution Steps:**
  1. Consumer client issues `GET /providers/prov_mike_01/slots`.
  2. Parse response and extract `slotId: "slot_react_101"` and `price: 5000`.
  3. Client issues authenticated `POST /bookings` with payload `{ slotId: "slot_react_101", paymentMethodId: "pm_card_valid" }`.
  4. Query database for slot record: `SELECT status FROM "Slot" WHERE id = 'slot_react_101'`.
- **Expected Results:**
  - `GET /providers/...` returns HTTP 200 with typed `ProviderProfileWithSlotsContract`.
  - `POST /bookings` returns HTTP 201 with `BookingConfirmationContract` (`status: "confirmed"`).
  - Database reflects slot `status` updated from `"available"` to `"booked"`.
- **Contract Points Validated:** `slotId` UUID casing, ISO 8601 UTC timestamp format, lowercase `confirmed` enum.

---

### Test 2: Booking Engine -> Payment Escrow Reservation Hold
- **Test ID:** `INT-TEST-02`
- **Name:** Booking Mutex Transactional Escrow Authorization
- **Components Involved:** Booking Service (Stream B), Payment Gateway Adapter (Stream C), Mock Escrow Provider.
- **Setup:** Authenticated learner session with pre-configured payment method `pm_card_visa`. Slot `slot_react_102` is available.
- **Execution Steps:**
  1. Client sends `POST /bookings` with `slotId: "slot_react_102"` and `paymentMethodId: "pm_card_visa"`.
  2. Booking Service invokes `IPaymentGateway.holdEscrow({ bookingId, amount: 5000, currency: "USD" })`.
  3. Payment Gateway verifies funds and returns `{ escrowHoldId: "esc_9921", status: "held" }`.
  4. Booking Service writes transaction ID to booking record and commits database transaction.
- **Expected Results:**
  - Returns HTTP 201 Created with `paymentStatus: "held"` and `totalPrice: 5000`.
  - Database stores `escrowHoldId: "esc_9921"` linked to the created booking.
- **Contract Points Validated:** `PaymentEscrowResultContract`, integer cent monetary representation, error propagation on payment decline.

---

### Test 3: Corporate Manager Delegation & Role Enforcement
- **Test ID:** `INT-TEST-03`
- **Name:** Corporate Role-Based Booking Delegation and Query Scoping
- **Components Involved:** Auth Service, NestJS RolesGuard, Booking Service, Users Controller.
- **Setup:** Seeded Meridian Corp accounts: Manager (`manager@meridian.com`, `role: MANAGER`), Employee (`employee@meridian.com`, `role: EMPLOYEE`), Department Head (`depthead@meridian.com`, `role: DEPT_HEAD`).
- **Execution Steps:**
  1. Authenticate as Manager -> Obtain JWT with claims `{ companyRole: "MANAGER", department: "Engineering" }`.
  2. Issue `POST /bookings` with `bookedFor: { name: "Jane Doe", email: "employee@meridian.com" }`.
  3. Verify HTTP 201 Created.
  4. Authenticate as Employee -> Attempt `POST /bookings` with `bookedFor` delegation block.
  5. Verify HTTP 403 Forbidden.
  6. Authenticate as Department Head -> Query `GET /users/me/bookings`.
- **Expected Results:**
  - Manager booking succeeds and records `bookedFor` metadata.
  - Employee delegation is blocked with HTTP 403 and error message `"Only corporate managers are authorized to book on behalf of other employees."`.
  - Department Head query returns Jane Doe's booking as part of the Engineering department summary.
- **Contract Points Validated:** JWT claims interface, NestJS `RolesGuard` error envelope, `UserBookingSummaryContract`.

---

### Test 4: Concurrency Collision Guard (Simultaneous Slot Booking)
- **Test ID:** `INT-TEST-04`
- **Name:** Race Condition Prevention on Shared Inventory Slot
- **Components Involved:** Booking Controller, Concurrency Mutex, Prisma `$transaction`, PostgreSQL Engine.
- **Setup:** Target slot `slot_concurrent_99` is marked `status: "available"`. Two distinct user tokens generated: Learner A and Learner B.
- **Execution Steps:**
  1. Trigger asynchronous parallel HTTP POST requests:
     - Worker 1: `POST /bookings` (User A, `slotId: "slot_concurrent_99"`).
     - Worker 2: `POST /bookings` (User B, `slotId: "slot_concurrent_99"`).
  2. Await both asynchronous responses.
  3. Query database count of bookings for `slot_concurrent_99`.
- **Expected Results:**
  - Exactly one request returns **HTTP 201 Created** with a confirmed booking.
  - Exactly one request returns **HTTP 409 Conflict** with message `"This slot has already been reserved."`.
  - Database contains exactly 1 booking row for `slot_concurrent_99`. Zero duplicate records.
- **Contract Points Validated:** HTTP 409 Conflict status envelope, slot status idempotency, transactional rollback on contention.
