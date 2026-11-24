# SkillSwap Risk-First Execution Plan (Module 03)

## 1. Risk Framework & Taxonomy
- **Integration Risk:** External dependencies beyond our control (Stripe API, webhooks, third-party mailers, banking rails).
- **Novelty Risk:** Uncharted engineering problems not previously solved by the team (distributed concurrency locking, race condition mitigation, multi-step state machines).
- **Dependency Risk:** Upstream foundational components whose failure or modification cascades catastrophic rework into all dependent branches.
- **Scale Risk:** Components whose algorithmic or storage assumptions collapse under target concurrent volume or multi-city expansion (instant search indexing, cache invalidation, database row locking contention).

---

## 2. Risk Annotations for All 13 Work Items

| Work Item ID | Name | Risk Score (1-5) | Risk Types | Risk Description & Rationale |
| :--- | :--- | :---: | :--- | :--- |
| **WI-01** | User Authentication & RBAC | **2** | Dependency | Standard JWT/bcrypt patterns (low novelty), but high dependency impact since all actors require identities. |
| **WI-02** | Listings & Provider Catalog Model | **4** | Dependency, Scale | High dependency impact. Must support multi-city partitioning and categories upfront; flawed schema choices cause massive migration rework. |
| **WI-03a**| Admin Review Tool (Minimal) | **1** | None significant | Simple status toggle (`PATCH /admin/providers/:id/status`) with zero third-party dependencies or algorithmic complexity. |
| **WI-03b**| Provider Onboarding & KYC | **3** | Novelty, Integration | Multi-state verification workflow, document payload uploads, and external KYC verification checks. |
| **WI-04** | Availability & Slot Schedule Engine | **2** | Novelty | Standard interval math and blackout overrides; moderate complexity in timezone translation. |
| **WI-05** | Instant Search & Category Taxonomy | **3** | Scale | High performance constraint ("feel instant" p95 < 100ms). Requires Postgres indexes and city-partitioned Redis caching. |
| **WI-06** | Booking Engine & Slot Mutex | **4** | Novelty, Scale | High concurrency race conditions. Two learners attempting to book the same slot requires Redis distributed mutex and atomic DB transitions. |
| **WI-07** | Payment Processing, Escrow & Commission | **5** | Integration, Novelty | **Highest Risk.** External Stripe API, webhook delivery guarantees, escrow holds, 15% commission math, and gateway fee absorption on refunds. |
| **WI-08** | Notification Queue & Email Dispatch | **2** | Integration | Third-party SMTP gateway. Low risk because it is placed behind an asynchronous BullMQ queue with automatic retries. |
| **WI-09** | Cancellation Engine & Refund Flow | **3** | Novelty, Integration | State machine evaluating cancellation tiers (cooling off vs lead-time), calculating refund distributions, and triggering Stripe refund APIs. |
| **WI-10** | Review System & No-Show Flagging | **1** | None significant | Standard relational CRUD operations linking users, providers, ratings, and feedback text. |
| **WI-11** | Full Admin Dashboard & Operations | **1** | None significant | Standard operational read views, aggregation queries, and dispute forms with zero blocking dependencies. |
| **WI-12** | Financial Audit Ledger & Telemetry | **3** | Dependency | Immutable double-entry financial journal. Requires zero-loss reconciliation against Stripe webhook events. |

---

## 3. Top Three Highest-Risk Items
1. **WI-07: Payment Processing, Escrow & Commission (Score: 5 | Integration & Novelty)**
   - *Why Top:* If Stripe Connect payouts, escrow holds, or webhook reconciliation fail, the platform cannot operate. It is governed by third-party API rate limits and financial regulations outside our codebase.
2. **WI-06: Booking Engine & Concurrency Slot Mutex (Score: 4 | Novelty & Scale)**
   - *Why Second:* Double-booking is a catastrophic trust failure. Resolving sub-millisecond race conditions across distributed web workers requires distributed locking and atomic database row locks.
3. **WI-02: Listings Data Model with Multi-City Boundaries (Score: 4 | Dependency & Scale)**
   - *Why Third:* Sits at the root of the dependency graph. Designing a single-city schema and retrofitting multi-city support in month 4 causes full database migrations, query rewrites, and cache invalidation redesigns.

---

## 4. Reordered Build Plan: Front-Loading Risk While Respecting the DAG

To retire the highest risks earliest, we incorporate **Spikes (Decision 2 Option A)** at the head of the schedule before committing production engineering:

```
[Day 1 Morning]  SPIKE-01: Stripe Payment & Escrow Webhook Spike (Retires WI-07 unknowns in 2 hours)
[Day 1 Afternoon] SPIKE-02: Redis Concurrency Slot Mutex Spike (Retires WI-06 race conditions in 2 hours)
                                        │
                                        ▼
```

### Sequenced Production Build Order

| Order | Task ID | Work Item Name | Risk | Rationale for Position |
| :---: | :--- | :--- | :---: | :--- |
| **1** | **WI-02** | Listings & Provider Catalog Model | 4 | **Root Foundation.** Built first to establish multi-city schema and category taxonomy, eliminating downstream schema rework. |
| **2** | **WI-01** | User Authentication & RBAC | 2 | **Root Prerequisite.** Standard implementation; unblocks actor identities across learners, providers, and admins. |
| **3** | **WI-03a**| Admin Review Tool (Minimal) | 1 | **Cycle Breaker.** 0.5-day build that provides the minimal approval endpoint required for provider onboarding. |
| **4** | **WI-04** | Availability & Slot Schedule Engine | 2 | **Critical Path Link.** Transforms provider availability into bookable slot records needed for concurrency testing. |
| **5** | **WI-06** | Booking Engine & Slot Mutex | 4 | **High Risk Retired Early.** Implements distributed slot locking and state transitions, validated by Spike-02. |
| **6** | **WI-07** | Payment Processing & Escrow Vault | 5 | **Highest Risk Retired Early.** Implements production Stripe integration, escrow holds, and 15% commission deduction. |
| **7** | **WI-05** | Instant Search & Category Taxonomy | 3 | **Scale Risk.** Connects to Listings model; validates p95 < 100ms caching and indexing while payments are in test. |
| **8** | **WI-03b**| Provider Onboarding & KYC Pipeline | 3 | **Pipeline Operationalized.** Connects provider KYC submission to minimal admin review endpoint. |
| **9** | **WI-09** | Cancellation Engine & Refund Flow | 3 | **Downstream Financial Consumer.** Implements refund state machine on top of completed booking and payment systems. |
| **10**| **WI-12** | Financial Audit Ledger & Telemetry | 3 | **Audit Invariant.** Implements double-entry ledger hooks into payment capture and refund events. |
| **11**| **WI-08** | Notification Queue & Email Dispatch | 2 | **Low Risk Leaf.** Asynchronous BullMQ mailer consuming booking and cancellation events. |
| **12**| **WI-10** | Review System & No-Show Flagging | 1 | **Low Risk Leaf.** Standard CRUD review submission attached to completed bookings. |
| **13**| **WI-11** | Full Admin Dashboard & Operations | 1 | **Lowest Risk Terminal Node.** Consumes operational data, dispute forms, and platform analytics without blocking core checkout. |
