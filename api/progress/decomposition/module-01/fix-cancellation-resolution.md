# Module 01: FIX — Resolving the Cancellation Contradiction & Architectural Tensions

## 1. Executive Summary for Product Management
The updated cancellation language creates a direct contradiction between provider policy autonomy (original Paragraph 2) and universal platform refund guarantees (updated Paragraph 1), while erroneously anchoring the 24-hour cutoff to the booking creation timestamp instead of appointment lead time.

Below are two concrete, buildable options proposed for PM sign-off.

---

## 2. Decision Proposals for Product Management

### Option 1: Standardized Tiered Policy with Platform Cooling-Off Floor (Recommended)
- **The Rule:**
  1. *Platform Cooling-Off Floor:* Any cancellation within **1 hour of booking** receives a 100% full refund, provided the booking was made at least 2 hours prior to the session.
  2. *Standardized Tiers:* Providers select one of three platform-enforced policy presets displayed prominently on their profile and checkout drawer:
     - **Flexible:** 100% refund up to 24 hours before session start; 0% thereafter.
     - **Moderate:** 100% refund up to 48 hours before session start; 50% refund between 24 and 48 hours; 0% thereafter.
     - **Strict:** 100% refund up to 72 hours before session start; 0% thereafter.
  3. *Late Cancellation Payout:* On late cancellations, provider receives their full 85% net earnings on the retained portion; platform retains 15% commission.
- **Stakeholders Affected:** Learners get transparent, standardized rules; providers retain tiered flexibility suited to their preparation time.
- **Implementation Complexity:** Moderate. Requires an enum column on `providers` (`cancellation_tier`), checkout policy rendering, and a deterministic state machine in the cancellation worker.

### Option 2: Universal Lead-Time Platform Policy (Simplified)
- **The Rule:**
  1. Universal platform rule anchored strictly to appointment start time:
     - Cancelled **> 24 hours prior to appointment start:** 100% refund to user; $0 to provider; slot immediately returns to search pool.
     - Cancelled **< 24 hours prior to appointment start:** 0% refund to user; 85% payout disbursed to provider; platform retains 15% commission.
  2. Providers have zero policy configuration options.
- **Stakeholders Affected:** Users have a single, frictionless rule across all bookings; providers lose pricing/cancellation autonomy.
- **Implementation Complexity:** Low. Simple binary comparison: `appointment_start_time - now() > 24 hours`.

---

## 3. Requirement Blast Radius Analysis
Marking REQ-06 and REQ-22 as `BLOCKED - pending PM decision`. The following dependent requirements are directly affected:

1. **REQ-04 (Payment Processing & Escrow):**
   - Must support programmatic partial refund webhooks and fee-split adjustments.
2. **REQ-06 (Learner Self-Service Cancellation):**
   - Blocked on policy evaluation logic and user-facing refund calculation preview.
3. **REQ-11 (Provider Earnings Dashboard):**
   - Earnings calculation must display "Pending (In Escrow)", "Cleared", and "Retained via Late Cancellation".
4. **REQ-22 (Cancellation Engine):**
   - Blocked on tier configuration schemas vs. hardcoded 24h lead-time constant.
5. **REQ-24 (Financial Audit Ledger):**
   - Must record gateway fee absorption policy (does the platform absorb the $0.30 + 2.9% refund fee, or pass it to the user?).

---

## 4. Deeper Architectural Tensions Identified

### Tension A: Autonomous Provider Availability vs. High Concurrency Booking
- *Conflict:* Providers expect simple calendar management, but high search volume on popular providers creates concurrent race conditions on single time slots.
- *Resolution:* Implement Redis-backed distributed locks (`SET slot:<id> user:<id> NX EX 600`) during checkout, backed by PostgreSQL serializable isolation or `SELECT FOR UPDATE` on slot checkout.

### Tension B: 15% Fixed Commission vs. Payment Gateway Refund Economics
- *Conflict:* Stripe does not return processing fees (2.9% + $0.30) when issuing refunds. A 100% refund means the platform loses money on every cancellation unless explicitly budgeted.
- *Resolution:* Platform terms must clarify whether refund transactions absorb processing fees or if the platform covers fees up to a monthly marketing buffer.

### Tension C: Sub-100ms Search Latency vs. Multi-City Expansion
- *Conflict:* Instant multi-filter search requires heavy caching, but expanding across 5 cities with distinct time zones and local provider availability risks cache invalidation storms.
- *Resolution:* Partition search caches by `city_id` and category slug (`cache:search:{city_id}:{category_id}`), invalidating only the affected city-category bucket when provider availability shifts.
