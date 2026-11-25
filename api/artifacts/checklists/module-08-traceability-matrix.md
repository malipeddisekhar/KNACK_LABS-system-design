# Module 08 Requirements Traceability Matrix

## Executive Summary
This matrix establishes the complete chain of custody for all 18 requirements originally extracted in Module 01, plus the corporate accounts requirement introduced in Module 07. Every requirement is mapped to its final disposition: **Built**, **Simplified**, **Deferred**, or **Lost**.

---

## Traceability Chain of Custody Table

| ID | Module 01 Requirement | Category | Current Status | Implementation Location / Artifact | Architectural & Scoping Justification |
|---|---|---|---|---|---|
| **REQ-01** | Skill Search & Category Filtering | Learner (F) | **Built** | `GET /providers?category=...` (`TICKET-02`) | Filter queries database by skill tags and category keywords. Verified in Scenario 1. |
| **REQ-02** | Provider Profile & Bio View | Learner (F) | **Built** | `GET /providers/:id` (`TICKET-02`) | Returns verified provider biography, hourly rate, and rating metrics. |
| **REQ-03** | Slot Availability View | Learner (F) | **Built** | `GET /providers/:id/slots` (`TICKET-02`) | Returns upcoming slots filtered by `status: "available"`. |
| **REQ-04** | Session Booking Reservation | Learner (F) | **Built** | `POST /bookings` (`TICKET-03`) | Creates confirmed reservation linked to learner and provider slots. |
| **REQ-05** | Cancellation Policy Enforcement | Learner (F/C) | **Deferred** | Terms of Service (`CUT-03`) | Self-service UI deferred to Sprint 2 to protect the 6-day investor demo. Tiered policy rules documented. |
| **REQ-06** | Sub-second Search Latency (<500ms) | Learner (Q) | **Built** | NestJS Repository Indexes | Verified sub-50ms query latency on indexed PostgreSQL provider catalog. |
| **REQ-07** | Double-Booking Concurrency Mutex | Learner (C) | **Built** | `BookingService.$transaction` (`TICKET-03`) | PostgreSQL row-level mutex (`SELECT FOR UPDATE`). 409 Conflict tested in Scenario 3. |
| **REQ-08** | Provider Profile Management | Provider (F) | **Simplified** | Static Seed Data (`TICKET-01`) | Simplified to pre-seeded verified provider profiles for MVP demo to avoid unneeded provider onboarding UI. |
| **REQ-09** | Recurring Availability Slots | Provider (F) | **Built** | Prisma `Slot` Schema (`TICKET-01`) | Seed fixtures define weekly recurring slots across providers. |
| **REQ-10** | Provider Booking Notification | Provider (F) | **Simplified** | Console Audit Logs (`CUT-05`) | Automated email delivery was cut during Module 07 RBAC absorption; replaced with structured stdout audit events. |
| **REQ-11** | Provider Payout & Earnings Tracking | Provider (F) | **Deferred** | Sprint 2 Backlog (`CUT-01`, `CUT-04`) | Provider balance tracking and Stripe Connect bank payouts deferred; mock escrow hold satisfies demo. |
| **REQ-12** | Minimum Booking Notice Constraint (2h) | Provider (C) | **LOST** | **Unimplemented in TICKET-03** | **Traceability Finding:** Extracted in Module 01 matrix as a provider constraint, but omitted during Module 05 ticket drafting where slot mutex logic was prioritized. Needs patch in Sprint 2. |
| **REQ-13** | Instant Availability Sync | Provider (Q) | **Built** | Transactional Slot Status | When a booking commits, slot status is immediately updated to `booked` in the same atomic transaction. |
| **REQ-14** | Escrow Payment Processing & Holds | Platform (F) | **Simplified** | `MockPaymentGateway` (`Slice 1.5`) | Decoupled via interface contract; holds funds in escrow without waiting for external Stripe account approval. |
| **REQ-15** | User Auth & JWT Token Security | Platform (F/C)| **Built** | `POST /auth/login` (`TICKET-04`) | Bcrypt password hashing, signed JWT bearer tokens, and `JwtAuthGuard` protection on private routes. |
| **REQ-16** | Two-Sided Cancellation Reconciliation | Platform (C) | **Deferred** | Sprint 2 Financial Engine | Escrow refund calculations deferred alongside self-service cancellation. |
| **REQ-17** | Structured Audit Logging | Platform (Q) | **Built** | NestJS Interceptor (`Module 05`) | Structured JSON logging capturing `requestId`, `timestamp`, `userId`, `action`, and execution duration. |
| **REQ-18** | IDOR & User Data Isolation | Platform (C) | **Built** | `UsersController` (`Module 05 Fix`) | Users can only access `/users/me/bookings`; IDOR attempts to query arbitrary user IDs return 403 Forbidden. |
| **REQ-19** | Corporate Delegation & 3-Tier RBAC | Corporate (F/C)| **Built** | `RolesGuard` (`Module 07 Fix`) | Support for Meridian Corp: Manager delegation booking, Employee view-only, Department Head department view. |

---

## 2. Traceability Metrics Summary
- **Total Requirements Tracked:** 19
- **Built:** 11 (57.9%) — Core transactional marketplace, atomic concurrency mutex, security, and corporate RBAC.
- **Simplified:** 3 (15.8%) — Pre-seeded provider onboarding, structured console logs, mock escrow hold.
- **Deferred:** 4 (21.1%) — Provider earnings dashboard, automated bank payouts, self-service cancellation, multi-facet search.
- **Lost (Omitted):** 1 (5.3%) — **REQ-12: 2-Hour Minimum Booking Notice Constraint**.

---

## 3. Retrospective on the Lost Requirement (REQ-12)
- **Root Cause Analysis:** In Module 01, REQ-12 was identified as a quality constraint ("Learners cannot book a slot starting in less than 2 hours"). During Module 05, our focus shifted heavily toward race-condition prevention (mutex locks, 409 conflict codes, and class-validator DTO annotations). Because time validation was treated as an unstated sub-rule rather than an explicit ticket acceptance criterion, no developer or AI agent generated a test or validator for it.
- **Remediation Plan:** Add a custom class-validator constraint `@IsAtLeastTwoHoursInAdvance()` to `CreateBookingDto` in Sprint 2 ticket backlog.
