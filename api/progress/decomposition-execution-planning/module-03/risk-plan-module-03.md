# SkillSwap Risk-First Execution Plan (Module 03 — Updated with Business Blocker Adaptation)

## 1. Risk Framework & Taxonomy
- **Integration Risk:** External dependencies beyond our control (Stripe API, webhooks, third-party mailers, banking rails).
- **Novelty Risk:** Uncharted engineering problems not previously solved by the team (distributed concurrency locking, race condition mitigation, multi-step state machines).
- **Dependency Risk:** Upstream foundational components whose failure or modification cascades catastrophic rework into all dependent branches.
- **Scale Risk:** Components whose algorithmic or storage assumptions collapse under target concurrent volume or multi-city expansion (instant search indexing, cache invalidation, database row locking contention).
- **External Business / Regulatory Risk (New):** Non-technical prerequisite blockers living outside the codebase (corporate incorporation, merchant acquiring underwriting, KYC compliance).

---

## 2. Risk Annotations for Work Items (Post-Bifurcation)

| Work Item ID | Name | Risk Score | Risk Types | Status & Rationale |
| :--- | :--- | :---: | :--- | :--- |
| **WI-01** | User Authentication & RBAC | 2 | Dependency | Active. Foundational prerequisite for all actors. |
| **WI-02** | Listings & Multi-City Catalog Model | 4 | Dependency, Scale | Active. Root data model; multi-city partitioning prevents downstream schema rework. |
| **WI-03a**| Admin Review Tool (Minimal) | 1 | Low | Active. Simple status toggle endpoint unblocking provider vetting. |
| **WI-03b**| Provider Onboarding & KYC | 3 | Novelty, Integration | Active. State machine connecting provider submission to admin review. |
| **WI-04** | Availability & Slot Schedule Engine | 2 | Novelty | Active. Slot generator and blackout window calculations. |
| **WI-05** | Instant Search & Category Taxonomy | 3 | Scale | Active. Validates p95 < 100ms caching and indexing. |
| **WI-06** | Booking Engine & Slot Mutex | 4 | Novelty, Scale | Active. High novelty concurrency locking; tests against mock payment contract. |
| **WI-07a**| **Payment Interface & Mock Adapter** | **2** | **Contract** | **NEW / Active. Defines `IPaymentGateway` and mock escrow adapter.** |
| **WI-07b**| **Live Stripe Production Integration** | **5** | **Business, Integration**| **BLOCKED (External). Awaiting client legal entity and Stripe merchant account.** |
| **WI-08** | Notification Queue & Email Dispatch | 2 | Integration | Active. Asynchronous BullMQ mailer with exponential retry queues. |
| **WI-09** | Cancellation Engine & Refund Flow | 3 | Novelty, Integration | Active. Evaluates policy tiers and triggers mock refunds. |
| **WI-10** | Review System & No-Show Flagging | 1 | Low | Active. Post-session review submission linked to completed bookings. |
| **WI-11** | Full Admin Dashboard & Operations | 1 | Low | Active. Dispute forms and operational analytics. |
| **WI-12** | Financial Audit Ledger & Telemetry | 3 | Dependency | Active. Double-entry audit ledger recording mock and live transactions. |

---

## 3. Revised Build Order: Front-Loading Risk Around the External Blocker

1. **WI-02 (Listings & Multi-City Catalog Model)** — Risk: 4 (Scale, Dependency). Root foundation.
2. **WI-01 (User Authentication & RBAC)** — Risk: 2 (Dependency). Foundational actor identity enabler.
3. **WI-03a (Admin Review Tool - Minimal)** — Risk: 1 (Cycle Breaker). 0.5-day approval endpoint.
4. **WI-07a (Payment Interface Contract & Stub)** — Risk: 2 (Interface). Establishes `IPaymentGateway` and mock adapter.
5. **WI-04 (Availability & Slot Schedule Engine)** — Risk: 2 (Novelty). Generates bookable slots.
6. **WI-06 (Booking Engine & Slot Mutex)** — Risk: 4 (Novelty, Scale). High concurrency locking using mock payment tokens.
7. **WI-05 (Instant Search & Category Taxonomy)** — Risk: 3 (Scale). p95 < 100ms Redis caching and DB indexing.
8. **WI-03b (Provider Onboarding & KYC Pipeline)** — Risk: 3 (Novelty). Connects provider KYC to minimal admin tool.
9. **WI-09 (Cancellation Engine & Refund Flow)** — Risk: 3 (Novelty). Evaluates policies and triggers mock refunds.
10. **WI-12 (Financial Audit Ledger & Telemetry)** — Risk: 3 (Dependency). Double-entry financial journal.
11. **WI-08 (Notification Queue & Email Dispatch)** — Risk: 2 (Integration). Asynchronous email dispatch.
12. **WI-10 (Review System & No-Show Flagging)** — Risk: 1 (Low). Star rating and feedback submission.
13. **WI-11 (Full Admin Dashboard & Operations)** — Risk: 1 (Low). Reporting dashboards and dispute UI.
14. **GATE: WI-07b (Live Stripe Integration & Connect Payouts)** — Risk: 5. **Blocked externally until merchant paperwork clears.**
