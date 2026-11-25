# Module 04: Vertical Slicing — Context Notes

## Micro-Exercise: "A user can book a service provider"

### 1. Horizontal Layers Analysis
Building horizontally means constructing layer-by-layer across the entire application domain before assembling any working feature:
1. **Presentation / UI Layer:**
   - Web / mobile components, booking forms, calendar date-time picker, slot selection grids, confirmation dialogs, loading states, error alerts.
2. **API & Transport Layer:**
   - REST/GraphQL endpoints (`POST /api/v1/bookings`, `GET /api/v1/providers/:id/slots`), request validation DTOs, response serializers, HTTP status codes, middleware (auth, rate limiting).
3. **Application & Business Logic Layer:**
   - Booking service, slot mutex/double-booking protection, status transition state machine (`DRAFT` -> `PENDING` -> `CONFIRMED`), business invariant enforcement (e.g., cannot book past slots, minimum lead time).
4. **Data Access & Persistence Layer:**
   - Database tables (`providers`, `services`, `availability_slots`, `bookings`, `users`), foreign keys, unique constraint indexes (`provider_id + start_time`), migrations, seeds, ORM entities/repositories.
5. **Integration & Infrastructure Layer:**
   - Payment gateway interface, transactional email/SMS dispatch, background worker queue for booking reminders.

**The Danger of Horizontal Slicing:**
If a team builds all database tables, then all APIs, then all UI screens, nobody experiences a working end-to-end booking flow until the final sprint. Schema flaws (e.g., mismatch in timezone representation or booking status transitions) remain completely hidden until late integration, resulting in massive rework.

---

### 2. The Minimal Vertical Slice
A vertical slice cuts a thin, narrow needle through **every single layer** from the UI down to the database and back up.

#### What is IN the Minimal Vertical Slice (The Core Thread):
- **User / Persona:** 1 authenticated test user ("Bob").
- **Provider & Service:** 1 seeded provider ("Alice - Math Tutor") offering 1 predefined service ("Calculus 101 - 60 min, Free").
- **Time Slot:** 1 single open time slot ("Tomorrow at 10:00 AM UTC").
- **UI:** A minimal webpage displaying Alice's single slot and a single primary button: `[Book Tomorrow at 10:00 AM]`.
- **API Endpoint:** A single HTTP handler `POST /api/v1/bookings` accepting `{ providerId, slotId }`.
- **Business Logic:** Atomic verification that slot is currently `AVAILABLE`, followed by state transition to `CONFIRMED`.
- **Database:** Atomic write to `bookings` table setting `status = 'CONFIRMED'` and updating slot `is_booked = true`.
- **Feedback:** UI receives HTTP `201 Created` and renders an immediate confirmation banner: `"Success! Your booking with Alice for Tomorrow at 10:00 AM is confirmed (Booking #101)."`.

#### What is EXCLUDED (Deferred to Subsequent Slices):
- **Search & Discovery:** Browsing providers, filtering by category, search bar, pagination.
- **Provider Calendar Management:** Recurring schedule builder, blackout dates, Google Calendar bi-directional sync.
- **Payments & Billing:** Credit card checkout, Stripe webhooks, escrow, refunds, invoices.
- **Rescheduling & Cancellations:** Provider/client cancellation flows, refund policy enforcement.
- **Notifications:** Async emails, SMS alerts, push notifications, webhooks.
- **Ratings & Reviews:** Post-session feedback, review forms, star ratings.
- **Complex UI Polish:** Animations, responsive calendar grid, timezone pickers (assumes UTC).

#### Why This Slice Proves the Architecture on Day 1:
1. **Validates Full-Stack Wiring:** Proves the client can speak to the backend API, the backend can execute business logic, and the database transaction successfully persists state.
2. **Exposes Integration Contracts:** Surfaces exact JSON payload shapes, status code expectations, and error payloads before hundreds of lines of UI are written.
3. **Creates Immediate Stakeholder Demo:** Within the very first sprint (or days), stakeholders can physically click a button, watch the DB update, and verify the core value proposition.
