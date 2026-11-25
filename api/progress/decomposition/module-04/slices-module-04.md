# Vertical Slice Plan: SkillSwap Marketplace (Adapted for Stakeholder Payment Spike)

This document outlines the adapted, end-to-end vertical slices guiding the implementation of SkillSwap. Following investor feedback requesting tangible proof of money flow for an upcoming Friday demo, this plan introduces **Slice 1.5 (Standalone Payment Spike)** without compromising the integrity or timeline of Slice 1.

---

## Slice 1: Browse and Book (Seeded Data)

### 1. Name
`Browse and Book (Seeded Data)`

### 2. Scope (What Is In)
- **UI:** Clean catalog view displaying 3 hardcoded provider cards (Name, Headline, Skill Category, Star Rating, Hourly Rate).
- **Detail View:** Clicking a provider navigates to their profile page showing a short bio, 1 service ("Initial Consultation - 60 min"), and a static list of 3 available time slots.
- **Booking Action:** User selects 1 time slot and clicks `[Book Appointment]`.
- **API & Persistence:** `POST /api/v1/bookings` accepts `{ providerId, slotId }` with caller identity `anon-user-001`, persists a record with status `CONFIRMED`, and locks the slot.
- **Feedback:** Confirmation page displaying Booking Reference ID, Provider Name, Service Name, Scheduled Time, and confirmation banner.
- **Persistence:** Database-backed; state persists on browser reload.

### 3. Anti-Scope (What Is Explicitly Out)
- **No User Authentication:** Anonymous usage.
- **No Payment Processing:** Free introductory session; no payment SDK or checkout modals.
- **No Notifications:** No emails or SMS alerts.
- **No Search or Filtering:** Static provider list.
- **No Provider Portal:** Seeded database records only.
- **No Rescheduling or Cancellation:** Bookings are immutable.
- **No Real-time Calendar Sync:** No Google/Outlook integrations.
- **No Reviews or Ratings Submission:** Static display stars only.
- **No Admin Dashboard:** No moderation or dispute tooling.

### 4. Dependencies
- None (First vertical slice).

### 5. Acceptance Criteria
1. Open application homepage — see 3 provider cards.
2. Click on "Alice - Calculus Tutor" — profile displays bio and 3 open time slots.
3. Select "Tomorrow at 10:00 AM" and click "Book Appointment".
4. View immediately redirects to confirmation screen displaying Booking `#BK-1001` and appointment details.
5. Refresh browser and return to Alice's profile — "Tomorrow at 10:00 AM" is disabled and marked "Booked".

### 6. Estimated Complexity & Schedule
`S (Small: 2–3 hours) — Target Delivery: Tuesday 2:00 PM`

---

## Slice 1.5: Standalone Payment Spike (Investor Proof of Money Flow)

### 1. Name
`Standalone Payment Spike (Investor Proof of Money Flow)`

### 2. Context & Strategic Purpose
Introduced specifically in response to investor requirements to see money flow through the platform ahead of the Friday demo. This slice provides an isolated, bulletproof proof of financial transactions using Stripe test mode on a dedicated verification route (`/demo/payment-flow`). It avoids coupling payment integration risk to the core booking flow while completely satisfying the investor's core concern.

### 3. Scope (What Is In)
- **Dedicated Demo Route:** Clean, self-contained verification page at `/demo/payment-flow`.
- **Pre-configured Checkout Card:** Displays a sample $40.00 tutoring charge + $4.00 platform fee (Total: $44.00).
- **Stripe Elements Test Form:** Live test-mode card input field supporting standard Stripe test cards (`4242...`).
- **Live Stripe API Authorization & Capture:**
  - Calls Stripe Test API to create a `PaymentIntent`.
  - Authorizes a hold for $44.00 and immediately captures the funds.
  - Receives live Stripe response payload.
- **Live Transaction Proof Display:**
  - Renders real Stripe Charge ID (e.g., `ch_3O48kd...`).
  - Displays funds status: `$40.00 Provider Escrow Held`, `$4.00 SkillSwap Platform Fee Deducted`.
  - Provides a clickable `[Simulate Refund]` button that triggers Stripe Test API refund and displays the refund confirmation receipt.

### 4. Anti-Scope (What Is Explicitly Out)
- **No Booking Flow Integration:** The payment spike is NOT wired into Slice 1's booking modal. They demo as two synchronized pieces.
- **No Live Production Banking / Payouts:** Uses Stripe test keys (`pk_test_...` / `sk_test_...`); no real credit cards, bank routing numbers, or KYC verification.
- **No User Database Association:** Payment transactions are not linked to user accounts or booking records.
- **No Complex Webhook Infrastructure:** Uses direct synchronous PaymentIntent confirmation; no async webhook listener daemon required for this demo.
- **No Saved Payment Vaulting:** Card details are entered per demo run and never stored.

### 5. Dependencies
- None. Runs as an independent, decoupled spike module alongside Slice 1.

### 6. Acceptance Criteria
1. Navigate directly to `/demo/payment-flow` in Google Chrome.
2. View displays charge summary: "Alice's Calculus Tutoring: $40.00", "Platform Fee (10%): $4.00", "Total: $44.00".
3. Enter Stripe test card `4242 4242 4242 4242`, expiration `12/28`, CVC `123`, and click "Process Live Test Charge".
4. Within 1.5 seconds, screen displays success receipt: "Payment Authorized & Captured in Stripe Test Mode", displaying real Stripe Transaction ID `ch_...` and fee breakdown.
5. Click "Simulate Escrow Refund" — screen immediately confirms: "Full $44.00 refunded via Stripe Test API (Refund ID: `re_...`)".

### 7. Estimated Complexity & Schedule
`S (Small: 4–6 hours) — Target Delivery: Thursday 12:00 PM`

---

## Slice 2: Real User Authentication & Booking Dashboard

### 1. Name
`User Authentication & Booking Dashboard`

### 2. Scope (What Is In)
- User registration (`POST /api/v1/auth/register`) and login (`POST /api/v1/auth/login`) with bcrypt hashing and JWT cookies.
- Associating bookings with authenticated user ID.
- User Dashboard page displaying "My Bookings" with status.

### 3. Anti-Scope
- No OAuth, no email verification links, no forgot password flow, no provider accounts, no avatar uploads.

### 4. Dependencies
- Slice 1.

### 5. Estimated Complexity & Schedule
`M (Medium: 1–1.5 days)`

---

## Slice 3: Provider Self-Service & Availability Publishing

### 1. Name
`Provider Self-Service & Availability Publishing`

### 2. Scope (What Is In)
- Provider account onboarding, bio and hourly rate setting, service definition, weekly slot generator, and dynamic marketplace query.

### 3. Anti-Scope
- No background check vetting gates, no Google Calendar sync, no recurring weekly schedule rules.

### 4. Dependencies
- Slice 2.

### 5. Estimated Complexity & Schedule
`M (Medium: 1.5 days)`

---

## Slice 4: Payment Escrow & Checkout Integration

### 1. Name
`Payment Escrow & Checkout Integration`

### 2. Scope (What Is In)
- Fuses the booking flow from Slice 1 with the payment engine validated in Slice 1.5.
- Implements `IPaymentGateway` interface to process real holds within the checkout modal, locking booking status in `PAID_ESCROW`.

### 3. Anti-Scope
- No live production bank ACH transfers, no saved cards, no sales tax calculation engine.

### 4. Dependencies
- Slice 1, Slice 1.5, Slice 2, Slice 3.

### 5. Estimated Complexity & Schedule
`M (Medium: 1.5–2 days)`

---

## Slice 5: Cancellation, Tiered Refund & Post-Session Review

### 1. Name
`Cancellation, Tiered Refund & Post-Session Review`

### 2. Scope (What Is In)
- Client cancellation button, tiered refund calculations (>24h 100%, 12-24h 50%, <12h 0%), automated escrow release via `IPaymentGateway`, and 1-5 star review submission.

### 3. Anti-Scope
- No arbitration center, no review moderation queue, no image uploads, no SMS alerts.

### 4. Dependencies
- Slice 4.

### 5. Estimated Complexity & Schedule
`M (Medium: 1.5–2 days)`
