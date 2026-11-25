# Module 07 Updated Execution Plan (Version 3: Layered RBAC & 6-Day Delivery)

## Executive Summary
This is Version 3 of our execution plan, updated to incorporate **3-Tier Role-Based Access Control** (Manager, Employee, Department Head) requested by Meridian Corp's IT Director, while defending the **6-day investor demo milestone** through disciplined compensatory cuts.

---

## 1. Preserved Tickets (Unchanged Work)
1. **TICKET-01: Seed Provider Availability Data** (Completed)
   - 5 verified providers with recurring weekly availability slots.
2. **TICKET-02: Public Catalog & Slot Listing API** (Completed)
   - `GET /providers` and `GET /providers/:id/slots` returning typed provider profiles and available time slots.
3. **Core Atomic Slot Mutex Transaction** (Foundational Engine)
   - Concurrency protection in `BookingService` ensuring double-booking prevention under concurrent requests.

---

## 2. Modified Tickets (Evolved for RBAC)
1. **TICKET-03: Atomic Booking API (`POST /bookings`)**
   - Incorporates `CompanyRole.MANAGER` authorization check.
   - Accepts `bookedForName` and `bookedForEmail`.
   - Rejects non-managers attempting delegation with **HTTP 403 Forbidden**.
   - Records booker ID, attendee email, and attendee department in `Booking` table.
2. **TICKET-04: User Authentication & Role Claims (`POST /auth/login`)**
   - JWT payload carries `companyName`, `companyRole` (`EMPLOYEE | MANAGER | DEPT_HEAD`), and `department`.
   - Seeds 3 test personas:
     - `manager@meridian.com` (Engineering Dept, Manager)
     - `employee@meridian.com` (Engineering Dept, Employee)
     - `depthead@meridian.com` (Engineering Dept, Department Head)
3. **TICKET-05: User Booking History & Department Scoping (`GET /users/me/bookings`)**
   - Scopes query response based on role:
     - Employee sees only bookings where they are the learner or attendee.
     - Manager sees bookings they executed for employees.
     - Department Head sees all bookings belonging to their department.

---

## 3. Comprehensive Cut List (Defending the 6-Day Target)
All cut items have been verified for zero dangling runtime dependencies:
1. **CUT-01:** Provider Earnings & Analytics Dashboard (Pure read aggregation; safe to cut).
2. **CUT-02:** Advanced Multi-Facet Skill Filtering (Existing search suffices; safe to cut).
3. **CUT-03:** Self-Service Cancellation & Refund Flow (Happy path demo; safe to cut).
4. **CUT-04:** Automated Stripe Connect Bank Payouts (Mock escrow hold suffices; safe to cut).
5. **CUT-05:** Automated Attendee Email Notifications (Was SHOULD SHIP; cut to absorb RBAC).
6. **CUT-06:** Provider Dashboard Calendar Grid View (Was SHOULD SHIP; cut to absorb RBAC).
7. **CUT-07:** Self-Service Department & Role Administration Portal (Static demo seeding; safe to cut).

---

## 4. Added Tickets
1. **TICKET-06: Typed Corporate Role Model & Guard (Estimate: M - 7 hours)**
   - Schema migration for `CompanyRole` enum and `department` strings; implementation of NestJS `RolesGuard` and HTTP 403 rejection.
2. **TICKET-07: Department Query Scoping & 3-Persona Seed Drill (Estimate: M - 5 hours)**
   - Repository query routing for Employee / Manager / Dept Head; automated end-to-end smoke test validating all 3 personas.

---

## 5. Daily Milestone Schedule (Days 1 to 6)
- **Day 1:** Execute TICKET-06 (Prisma `CompanyRole` migration, `RolesGuard`, delegation 403 checks).
- **Day 2:** Finalize TICKET-04 (Auth with Corporate Role & Department JWT claims) & seed Meridian personas.
- **Day 3:** Execute TICKET-07 (Implement department-scoped query filtering in `GET /users/me/bookings`).
- **Day 4:** Integrate Mock Payment Escrow flow with corporate confirmation receipts.
- **Day 5:** Full 3-Persona End-to-End Clickthrough Smoke Drill (Manager books for Employee -> Employee views booking -> Dept Head audits department).
- **Day 6:** Buffer for regression stabilization, staging deployment verification, and investor demo execution.
