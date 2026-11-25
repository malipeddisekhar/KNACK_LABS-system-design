# Module 07 Decision: Mid-Build Adaptation Strategy & Replanning Scope

## Decision Overview
Mid-build adaptation requires deliberate trade-offs under high time pressure. With an investor demo in 6 days and an unexpected requirement from corporate prospect Meridian Corp ("company accounts that can book on behalf of employees"), we must decide how to architect the change and how to adjust our execution plan.

---

## 1. Decision 1: How to Respond to "Company Accounts" (`change_response_strategy`)
- **Option A: Scope It In Properly (`scope_properly`)**
  - Full relational re-architecture: `Organization` entity, `UserOrganization` join table, role-based access control (Admin, Manager, Employee), corporate invoicing, and organization-scoped provider dashboards.
  - *Evaluation:* 2 to 3 weeks of architectural work touching every layer. Guaranteed to blow past the 6-day investor demo, creating an existential funding crisis.
- **Option B: Minimal Bridge (`minimal_bridge`)** [SELECTED]
  - Pragmatic schema extension: Add `company_name: string?` and `can_book_for_others: boolean` to the `User` model; add `booked_for_name: string?` and `booked_for_email: string?` to the `Booking` model.
  - Payment stays bound to the booking user's payment method (Meridian handles internal corporate reimbursement).
  - *Evaluation:* Ships in 3 to 4 days, preserves the atomic booking mutex and payment escrow contracts from Module 06, and keeps the investor demo and Meridian pilot on track.
  - *Technical Debt Mitigation:* The fields are explicitly marked as `v1_corporate_bridge` metadata. A migration plan to a normalized `Organization` entity is scheduled for sprint 1 post-funding.

---

## 2. Decision 2: How Much of the Existing Plan to Rewrite (`replan_scope`)
- **Option A: Preserve and Patch (`preserve_and_patch`)**
  - Keep all completed, in-progress, and unstarted tickets intact; append new tickets for corporate booking and cut arbitrary tickets at the end.
  - *Evaluation:* Creates a "Frankenstein plan" with awkward seams between consumer bookings and corporate bookings.
- **Option B: Replan From Current State (`replan_from_current`)** [SELECTED]
  - The GPS Model: Treat completed work (TICKET-01 Seed Data, TICKET-02 Catalog Listing, TICKET-03 Atomic Booking Mutex) and in-progress work as immutable fixed coordinates.
  - Re-evaluate all unstarted backlog from zero against the 6-day demo milestone.
  - Prune non-essential backlog items (e.g., provider payout dashboard analytics, complex cancellation dispute workflows) to create bandwidth for the corporate booking bridge and end-to-end demo verification.

---

## 3. Decision Record
- **Choice:** **Option B** (`minimal_bridge` + `replan_from_current`)
- **Reasoning:**
  A minimal bridge unblocks Meridian Corp and preserves the existential 6-day investor demo milestone without taking on a 3-week relational re-architecture that would derail funding. By replanning from our current state (GPS model), we treat our completed auth, catalog, and booking mutex foundations as fixed assets and re-sequence the remaining backlog to incorporate corporate delegation while pruning non-critical scope.
