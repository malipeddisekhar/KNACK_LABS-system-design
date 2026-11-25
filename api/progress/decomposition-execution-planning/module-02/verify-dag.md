# Module 02: VERIFY — Stress-Testing the Dependency DAG & Critical Path

## 1. Critical Path Audit

### A. The Chain
The longest sequential chain of hard dependencies from start to finish is:
$$\text{WI-02 (Listings Model)} \xrightarrow{\text{Hard}} \text{WI-04 (Availability)} \xrightarrow{\text{Hard}} \text{WI-06 (Booking)} \xrightarrow{\text{Hard}} \text{WI-07 (Payment)} \xrightarrow{\text{Hard}} \text{WI-12 (Ledger)}$$

- **Levels Deep:** 5 levels deep.
- **Item-by-Item Effort Estimates:**
  1. `WI-02 (Listings Data Model)`: 2 days (schema migrations, entities, relationships, validation).
  2. `WI-04 (Availability Engine)`: 3 days (recurring schedule expansion, blackout windows, slot generator).
  3. `WI-06 (Booking Engine)`: 3 days (concurrency slot locking, checkout drawer state machine, Redis mutex).
  4. `WI-07 (Payment & Escrow)`: 3 days (Stripe webhook processing, escrow holds, 15% platform split).
  5. `WI-12 (Financial Ledger)`: 2 days (immutable double-entry audit tables, reconciliation checks).
- **Total Critical Path Duration:** **13 working days** (~2.6 engineer-weeks).
- This 13-day sequence sets the absolute theoretical minimum delivery timeline regardless of team size.

---

## 2. The "Double Time" Resilience Drill

**Scenario:** What happens if `WI-06 (Booking Engine)` hits concurrency edge cases or distributed lock TTL issues and takes **6 days** instead of 3?

### Blast Radius & Delay Impact:
- **Directly Delayed Items (Downstream of WI-06):**
  - `WI-07 (Payment Processing)`: delayed by 3 days.
  - `WI-09 (Cancellation Flow)`: delayed by 3 days.
  - `WI-11 (Dispute Resolution)`: delayed by 3 days.
  - `WI-12 (Financial Audit Ledger)`: delayed by 3 days.
  - **Overall Project Completion Date:** Pushed back by exactly 3 days (from Day 13 to Day 16).
- **Completely Unaffected Items (Parallel Tracks with Slack Time):**
  - `WI-01 (Auth & RBAC)`: Continues on schedule.
  - `WI-03 (Provider Onboarding & Vetting)`: Unaffected.
  - `WI-05 (Search & Browse with Redis caching)`: Unaffected; proceeds in parallel with Listings data.
  - `WI-08 (Notification Queue)`: Unaffected; queue infrastructure and email templates can be developed against event stubs.
  - `WI-10 (Review System)`: Unaffected; rating submission logic and anti-abuse checks develop against fixture data.

**Resilience Verdict:** The architecture is resilient. Delays on the critical path only cascade into direct downstream payment/settlement consumers, leaving the entire discovery, onboarding, and catalog search sub-systems fully productive.

---

## 3. Verification Questions & Structural Audit

### Q1: Can I trace a path from "zero code exists" to "a user can complete a booking"?
- **Yes. The Minimal Booking Flow Path:**
  1. `WI-01 (Auth)` sets up user tokens and identity.
  2. `WI-02 (Listings)` establishes the provider and service tables.
  3. `WI-04 (Availability)` generates unreserved calendar slots.
  4. `WI-06 (Booking Engine)` accepts the learner token + slot ID and acquires the lock.
  5. Result: A confirmed reservation is produced in exactly 4 steps.

### Q2: Are there any completely isolated work items?
- **Audit Result:** Zero isolated items. All 12 items have at least one incoming or outgoing edge.
  - Root nodes (`WI-01`, `WI-02`) have 0 incoming edges and fan out to 2 and 3 downstream consumers respectively.
  - Leaf nodes (`WI-08`, `WI-10`, `WI-11`, `WI-12`) have 0 outgoing edges and consume upstream events.

### Q3: Could an unfamiliar developer immediately identify what to build first?
- **Yes.** The root layer of the DAG explicitly highlights `WI-01 (User Auth)` and `WI-02 (Listings Data Model)` as the two non-blocked Day 1 kickoff candidates.

---

## 4. Red Flag Checklist Audit
- [x] **No Flat Graph:** Tasks do not blindly depend on a single root item. `WI-02 (Listings Model)` does not depend on `WI-01 (Auth)`.
- [x] **No Full Serialization:** 4 major parallel branches operate concurrently (`WI-05 Search`, `WI-03 Onboarding`, `WI-08 Notifications`, `WI-10 Reviews`).
- [x] **No Missing Dependencies:** Data dependencies (e.g., Booking needing Availability, Search needing Listings) are strictly modeled as Hard edges.
