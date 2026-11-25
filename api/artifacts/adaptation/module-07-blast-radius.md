# Module 07 Blast Radius Analysis

## Overview
This document analyzes the architectural and execution blast radius of two concurrent shocks introduced mid-build:
1. **Requirement Change:** Meridian Corp requires "company accounts that can book on behalf of employees."
2. **Timeline Compression:** An urgent investor demo has been scheduled in **6 days**, compressing the delivery window.

---

## 1. Blast Radius Matrix: Company Accounts Requirement

| Artifact / Component | Status | Impact Level | Specific Technical Impact Analysis |
|---|---|---|---|
| **User Data Model** | In Progress | **MINOR** | Add optional fields `companyName: String?` and `canBookForOthers: Boolean @default(false)` to the Prisma `User` model. Does not require a new relational table or foreign keys for the demo. |
| **Auth / JWT System** | Specified / In Progress | **MINOR** | Update JWT token generation and `JwtPayload` interface to include `canBookForOthers: boolean` and `companyName: string | null`. Allows client and guards to conditionally render delegation UI and validate authorization without extra DB roundtrips. |
| **Booking Flow (API)** | In Progress | **MAJOR** | Extend `CreateBookingDto` with optional `bookedForName?: string` and `bookedForEmail?: string`. Add class-validator conditional validation (`@ValidateIf(o => o.bookedForEmail) @IsEmail()`). Extend `Booking` entity and `POST /bookings` response to return `bookedFor` delegation block. Concurrency mutex transaction remains unchanged. |
| **Booking Flow (UI)** | Not Started | **MINOR** | When `user.canBookForOthers === true`, render an expandable "Corporate Booking: Book for an Employee" section with name and email inputs in the booking review modal. Pre-fill confirmation summary with delegation notice. |
| **Provider Dashboard** | Not Started | **MINOR** | In the provider's upcoming session schedule, render an indicator badge: `Booked by: Meridian Corp (for Jane Doe <jane@meridian.com>)` so providers know who is actually attending the session. |
| **Search / Listing** | Completed | **NO IMPACT** | Provider catalog search, skill filtering, and slot availability querying are completely invariant to whether the booking user is an individual or booking on behalf of a colleague. |
| **Payment / Billing** | Decoupled / Mocked | **NO IMPACT** | Billing continues to charge the registered payment method of the corporate booker. Meridian Corp confirmed internal expense reimbursement will handle pilot billing; platform corporate invoicing is deferred post-funding. |
| **Interface Contracts** | Active | **MINOR** | Amend `BookingConfirmationContract` in `artifacts/contracts/module-06-interface-contracts.md` to include optional `bookedFor: { name: string; email: string } | null`. Preserves camelCase, UUID, and ISO 8601 UTC covenants. |
| **Tickets: Completed** | Completed | **NO IMPACT** | `TICKET-01: Seed Provider Availability Data` and `TICKET-02: Public Catalog & Slot Listing API` require zero alterations. |
| **Tickets: In Progress** | In Progress | **MAJOR** | `TICKET-03: Atomic Booking Reservation Mutex` must incorporate the delegation DTO fields and Prisma schema adjustments before finalizing. |
| **Tickets: Not Started** | Planned | **MAJOR** | `TICKET-04 (Auth/JWT)` gains corporate claims; `TICKET-05 (User Dashboard)` splits booking history into "Bookings for Me" vs "Bookings I Made for Others"; advanced post-MVP tickets are cut. |

---

## 2. Compressed Timeline: 6-Day Scope Categorization
With 6 days remaining until the investor demo, all unstarted and backlog tickets are categorized into non-overlapping buckets:

| Backlog Item / Capability | Categorization | Rationale & Trade-off |
|---|---|---|
| **Core Atomic Booking Mutex (TICKET-03)** | **MUST SHIP** | Core existential engine. Without atomic double-booking prevention, the marketplace demo cannot prove integrity. |
| **Auth & Corporate JWT Claims (TICKET-04)** | **MUST SHIP** | Required to demonstrate Meridian Corp's corporate booker persona vs regular learner persona. |
| **Corporate Delegation Bridge (TICKET-06)** | **MUST SHIP** | Required to win the Meridian Corp pilot; shows booking on behalf of employee Jane Doe. |
| **User Booking Dashboard (TICKET-05)** | **MUST SHIP** | Essential demo clickthrough proving the employee and corporate booker can see the confirmed reservation. |
| **Mock Payment Gateway Integration (Slice 1.5)** | **MUST SHIP** | Proves the financial transaction flow without relying on third-party Stripe webhook flakiness. |
| **Provider Attendee Notification Email** | **SHOULD SHIP** | High demo impact (showing an email sent to the employee), but fallback mock logs are survivable if time runs short. |
| **Provider Dashboard Calendar View** | **SHOULD SHIP** | Basic list view suffices if calendar grid layout takes too long to style. |
| **Automated Stripe Connect Payouts** | **CUT** | Out of scope for 6-day demo. Escrow holds remain simulated; payouts can be processed manually. |
| **Advanced Multi-Facet Skill Search** | **CUT** | Category and keyword search already works in TICKET-02. Complex facet filters add zero value for 5 demo providers. |
| **Cancellation & Refund Self-Service Flow** | **CUT** | Demo script will showcase the happy-path booking; dispute and refund policy handling is deferred to Sprint 2. |
| **Provider Earnings Analytics Dashboard** | **CUT** | Pure vanity metric for day 1; zero impact on booking validation or Meridian pilot conversion. |
