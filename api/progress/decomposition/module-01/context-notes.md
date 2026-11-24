# Module 01: CONTEXT — Reading Requirements & Uncovering Hidden Assumptions

## 1. Production Context: Why Software Fails at the Requirements Boundary
Most critical software failures do not stem from compiler errors or syntax defects, but from ambiguous, unstated, or conflicting requirements:
- The classic booking cancellation failure: `"Users should be able to cancel bookings"` looks trivial until users cancel 5 minutes before the appointment expecting 100% refunds, providers lose revenue, slots remain blocked, and payments already processed must be reversed.
- The 4 hidden questions:
  1. **Temporal Boundaries:** Cancel when? (Up to appointment, 24h cutoff, sliding scale?)
  2. **Financial Consequence:** Full refund, partial payout, penalty forfeit, platform fee retention?
  3. **Policy Governance:** Global platform rule vs. provider-customizable tier?
  4. **State & Inventory Transition:** Does the slot release back to search immediately, hold for a grace period, or archive?

---

## 2. Micro-Exercise: "Users can book time slots and pay through the platform"

Deconstructing the 12 words into 7 core assumption categories:

### A. Time Slot Definitions & Invariants
- Is a slot atomic (fixed 60 minutes) or variable (provider specifies 15, 30, 45, 60, 90 mins)?
- Can a learner book contiguous slots across boundaries?
- What are buffer times between consecutive slots (e.g., 10-minute turnaround)?
- How are time zones, daylight savings transitions, and provider local working hours represented?

### B. "Book" Semantics & Concurrency
- Is booking synchronous or asynchronous?
- Does clicking "Book" hold the slot with a distributed lock (e.g., Redis mutex / DB row lock with a 10-minute TTL) while payment completes?
- What happens when 5 users attempt to book the exact same Friday 4:00 PM slot concurrently?
- Does the provider have to accept/confirm, or is it instant confirmation upon payment capture?

### C. "Pay Through the Platform" & Financial Integrity
- Direct pass-through vs. platform escrow: does the platform capture funds and hold them in escrow until the session completes, or immediately disperse funds?
- Payment methods: Credit card (Stripe), digital wallets, bank debit, localized gateways?
- Currencies and multi-currency exchange rates?
- Failure states: what happens if the slot is temporarily locked but credit card authorization fails? Is the lock immediately released?
- Platform commission and fee calculation (e.g., platform keeps 15%, disburses 85% net of processing fees).

### D. Identity, Authorization & User State
- Who is "the user"? Unauthenticated guests vs. authenticated learners?
- Must learners verify phone numbers or email before booking?
- Can a provider book a session with another provider (role duality)?
- Can a provider book their own slot (self-booking prevention)?

### E. Lifecycle, Notifications & Auditability
- What notifications trigger on booking? (Email receipt, SMS reminder, calendar `.ics` invite to both parties).
- What audit logs track state transitions (`PENDING_PAYMENT` -> `CONFIRMED` -> `COMPLETED` / `CANCELLED`)?

### F. Performance & Latency Budgets
- What does "instant" search and booking feedback mean? (< 100ms API response, < 50ms DB query latency).
- How is slot availability queried without full table scans on millions of calendar intervals?

### G. Geographical & Multi-City Growth
- Are slots scoped to `city_id` / `timezone_id` to prevent multi-city expansion from breaking scheduling logic?
