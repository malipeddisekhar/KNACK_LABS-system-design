# SkillSwap Requirements Matrix (Categorized Matrix) — Updated with Incident Resolutions

## Architectural Taxonomy
- **Functional Requirement:** System capabilities, operations, state changes, and user-facing verbs.
- **Constraint:** Hard boundaries, business rules, regulatory/financial policies, and external fences.
- **Quality Attribute:** System characteristics, performance thresholds, scalability, security, and observability.

---

## 1. Categorized Requirements Matrix

| ID | Requirement Statement | Type | Stakeholder | Source | Confidence | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **REQ-01** | Learners can browse and filter verified service providers by category taxonomy. | Functional | User | Para 1 (Explicit) | High | Active |
| **REQ-02** | Learners can view public provider profile pages displaying biographical details, offerings, and aggregate rating scores. | Functional | User | Para 1 (Explicit) | High | Active |
| **REQ-03** | Learners can select and reserve available calendar time slots for a specific provider. | Functional | User | Para 1 (Explicit) | High | Active |
| **REQ-04** | Learners can pay for booked sessions directly through integrated platform payment processing. | Functional | User | Para 1 (Explicit) | High | Active (Impacted by REQ-06) |
| **REQ-05** | Learners automatically receive transactional confirmation emails containing booking details, calendar invite (.ics), and payment receipt upon booking completion. | Functional | User | Para 1 (Explicit) | High | Active |
| **REQ-06** | Learners can initiate a booking cancellation through self-service UI subject to the provider's active cancellation policy. | Functional | User | Para 1 (Contradictory Update) | Low | **BLOCKED - pending PM decision** |
| **REQ-07** | Search and catalog filtering responses must return within an instant perceptual threshold (p95 latency < 100ms under target concurrent load). | Quality Attribute | User | Para 1 (Explicit) | High | Active |
| **REQ-08** | Providers can configure and update their weekly/recurring availability windows and block out specific calendar intervals. | Functional | Provider | Para 2 (Explicit) | High | Active |
| **REQ-09** | Providers can define custom hourly or per-session pricing for their offered services. | Functional | Provider | Para 2 (Explicit) | High | Active |
| **REQ-10** | Providers can edit rich service descriptions, expertise tags, and prerequisite requirements. | Functional | Provider | Para 2 (Explicit) | High | Active |
| **REQ-11** | Providers have access to a dashboard displaying active bookings, historical earnings, payout history, and customer reviews. | Functional | Provider | Para 2 (Explicit) | High | Active (Impacted by REQ-06) |
| **REQ-12** | Providers can flag learners who fail to attend scheduled sessions (no-show incident reporting). | Functional | Provider | Para 2 (Explicit) | High | Active |
| **REQ-13** | Platform automatically retains a fixed 15% commission fee from each booked session's gross revenue prior to provider payout. | Constraint | Platform | Para 2 (Explicit) | High | Active |
| **REQ-14** | All new provider applicants must undergo a formal vetting and approval workflow before their profile and services become publicly searchable. | Functional | Platform / Ops | Para 2 (Explicit) | High | Active |
| **REQ-15** | System must maintain low latency and 99.9% uptime while supporting at least a few thousand concurrent active users in the launch city. | Quality Attribute | Platform | Para 3 (Explicit) | High | Active |
| **REQ-16** | Data model and core services must support multi-tenant city boundaries to enable expansion to 5 cities within 6 months without schema or architectural redesign. | Constraint | Platform | Para 3 (Explicit) | High | Active |
| **REQ-17** | Platform administrators have tools to inspect, arbitrate, and resolve escalated customer-provider disputes and issue appropriate manual adjustments or refunds. | Functional | Ops / Admin | Para 3 (Explicit) | High | Active |
| **REQ-18** | Platform must capture comprehensive telemetry and structured analytical events across all search, booking, payment, cancellation, and dispute operations. | Quality Attribute | Platform / Ops | Para 3 (Explicit) | High | Active |
| **REQ-19** | System must enforce distributed mutual exclusion (locking) on time slots during checkout to strictly prevent concurrent double-booking of the same provider slot. | Quality Attribute | Platform | Para 1 (Implicit) | High | Active |
| **REQ-20** | Secure authentication and role-based access control (RBAC) separating learner, provider, and administrative privileges, with account state management and session token validation. | Functional | Platform | Para 1 & 2 (Implicit) | High | Active |
| **REQ-21** | Platform escrow mechanism to hold booking funds safely between payment capture and verified session completion before triggering provider payout reconciliation. | Functional | Platform / Provider | Para 1 & 2 (Implicit) | Medium | Active |
| **REQ-22** | Structured cancellation policy engine allowing providers to select standardized refund rules (e.g., Full refund 24h+, 50% 12-24h, 0% <12h) rendered transparently at checkout. | Constraint | Platform / Provider | Para 1 (Contradictory Update) | Low | **BLOCKED - pending PM decision** |
| **REQ-23** | Asynchronous email dispatch with retry queues (e.g. Bull/Redis) to prevent SMTP/mailer outages from blocking synchronous checkout responses. | Quality Attribute | Platform | Para 1 (Implicit) | High | Active |
| **REQ-24** | Financial audit ledger tracking gross transaction volume, platform commission, net provider liability, refunds, and adjustments with strict zero-loss reconciliation. | Constraint | Platform / Ops | Para 2 (Implicit) | High | Active (Impacted by REQ-06) |

---

## 2. Blocked Policy Resolution: PM Options for REQ-06 / REQ-22

1. **Option 1 (Recommended - Hybrid Standardized Tiers):**
   - 1-hour cooling-off window for learners (100% refund).
   - Providers select one of 3 standardized tiers: *Flexible* (24h lead time), *Moderate* (48h lead time, 50% at 24h), *Strict* (72h lead time).
   - Late cancellations disburse 85% net earnings to the provider.
2. **Option 2 (Universal Platform Lead-Time Rule):**
   - Flat platform rule: > 24 hours prior to appointment = 100% refund; < 24 hours = 0% refund (85% paid to provider).
   - Zero provider customization.

### Downstream Dependency Impact:
- **REQ-04 (Payments):** Must support partial refund triggers and gateway fee absorption rules.
- **REQ-11 (Provider Dashboard):** Must display escrow vs. cleared vs. late-cancellation earnings.
- **REQ-24 (Financial Ledger):** Must track gateway processing fee loss on refunds.

---

## 3. Architectural Tensions Identified
- **Tension A (Provider Autonomy vs. High Concurrency):** Solved via Redis distributed lock mutex during checkout + DB row locks (`SELECT FOR UPDATE`).
- **Tension B (15% Commission vs. Gateway Fees on Refunds):** Requires explicit business policy on fee absorption.
- **Tension C (Sub-100ms Search vs. Multi-City Scale):** Solved via city-partitioned cache invalidation keys (`cache:search:{city_id}:{category_id}`).
