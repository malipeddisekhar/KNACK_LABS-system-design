# Module 01: VERIFY — Pressure-Testing Requirements & Probing Ambiguities

## 1. Three Most Confident Requirements
1. **REQ-13: 15% Platform Commission**
   - *Why Clear:* Explicitly quantified in Paragraph 2 ("takes a 15% commission on all bookings"). Unambiguous numeric percentage with zero room for subjective debate.
2. **REQ-08 & REQ-09: Provider Availability and Custom Pricing**
   - *Why Clear:* Explicitly stated in Paragraph 2 ("set their own availability, pricing, and descriptions"). Clear domain verbs mapping directly to calendar intervals and decimal currency amounts in the provider data model.
3. **REQ-05: Automated Confirmation Emails**
   - *Why Clear:* Explicitly stated in Paragraph 1 ("get confirmation emails"). Direct user trigger-action mapping from booking completion to email dispatch.

---

## 2. Three Least Confident Requirements
1. **REQ-21: Platform Escrow & Payout Reconciliation Mechanics**
   - *Why Uncertain:* Inferred from marketplace mechanics. The spec states the platform takes a 15% commission, but remains completely silent on whether payment capture immediately disburses 85% to the provider or holds funds in escrow until the session is completed or dispute windows expire.
2. **REQ-22: Structured vs. Free-Text Cancellation Policy**
   - *Why Uncertain:* Paragraph 1 states "with the provider's cancellation policy applied," but does not specify whether this policy is arbitrary prose or a discrete enum of programmatic refund rules (e.g. 24h/48h sliding scale). Arbitrary prose cannot be evaluated automatically by payment webhooks without human ops intervention.
3. **REQ-14: Provider Vetting Workflow & Criteria**
   - *Why Uncertain:* Paragraph 2 mentions "vetting process," but specifies zero operational criteria. Is it automated identity verification (Stripe Identity / KYC), manual admin document review, background checks, or a portfolio interview? The engineering effort varies from 1 day to 4 weeks based on this scope.

---

## 3. Detailed Answers to Probing Questions

### A. What does "feel instant" mean in milliseconds?
- *Engineering Translation:* Human perception perceives interactions as instantaneous when response times are under **100ms**. Between 100ms and 300ms, users perceive a slight delay. Over 500ms, the interface feels sluggish; over 1000ms, user flow is broken.
- *Quantitative Specification:*
  - Search API p95 latency: `< 100ms` for cached category/keyword queries.
  - Search API p99 latency: `< 250ms` under peak concurrency of 100 queries/sec.
  - Architecture required: Postgres B-tree index on `(city_id, category_id, is_active)` plus in-memory Redis caching for top category search result sets.

### B. What does "cancellation policy applied" actually mean for money flow?
- *Financial Flow Deconstruction:*
  - When a user pays $100 for a slot:
    1. Platform captures $100 and holds it in escrow account.
    2. When the user cancels 36 hours prior (under a 24h+ full refund policy):
       - Refund: $100 returned to user.
       - Processing fee: Platform must absorb the 2.9% + $0.30 payment gateway charge (or deduct it from refund pool).
       - Provider receives $0.
       - Slot is immediately unlocked in the database.
    3. When the user cancels 6 hours prior (under a late cancellation 50% refund policy):
       - User receives $50 refund.
       - Platform retains 15% commission on gross ($15) or net ($7.50).
       - Provider receives remaining balance ($35 or $42.50).
  - Without programmatic policy rules, this cannot be automated safely.

### C. What does the "vetting process" look like?
- *Operational Scope Options:*
  - Level 1 (Lightweight MVP): Email verification + completed profile with sample service and connected Stripe Connect payout account -> Auto-submitted for admin 1-click approval.
  - Level 2 (Compliance): Government photo ID upload + automated KYC check via third-party provider (e.g., Stripe Identity) before profile publish.
  - Level 3 (Full Professional): Background check, proof of certification, manual phone screening.
  - *Recommendation:* Scope MVP to Level 1 with an admin `/admin/providers/pending` queue and manual toggle `is_verified = true`.

### D. What does "analytics on everything" actually scope to?
- *Telemetry Scoping:*
  - Trap: "Analytics on everything" can range from a single Google Tag Manager script to a distributed event-streaming Kafka/ClickHouse data warehouse.
  - *Bounded Scope for SkillSwap:*
    - Operational Logging: Structured JSON logs for all state-changing API requests (`POST /bookings`, `POST /cancellations`, `POST /payouts`).
    - Prometheus Metrics: Counters for `http_requests_total`, `bookings_created_total`, `cancellations_total`, `gross_booking_value_dollars`.
    - Business Dashboard: A relational SQL view aggregating daily active bookings, GMV, platform commission, and active providers per city.

---

## 4. Verification Checklist & Count Audit
- Total requirements extracted: **24 requirements** (exceeds the 15+ target).
- Explicit vs. Implicit separation documented.
- All 4 probing questions analyzed with quantitative constraints and financial flows.
- Ambiguity and PM questions list updated and verified.
