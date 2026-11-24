# Module 03: CONTEXT — Risk-First Ordering & Retiring Unknowns Early

## 1. Production Context: The Cost of Delaying Scary Things
- **The Core Anti-Pattern:** Building comfortable, familiar features first (CRUD forms, UI polish) and saving scary unknowns (third-party payment APIs, distributed concurrency locks, escrow reconciliation) for late in the schedule.
- **The Oil Well Analogy:** Drill the test well first to verify oil exists before laying 50 miles of pipeline. If the test well fails, you lose a test well; if you build the pipeline first and find no oil, you lose the entire venture.
- **Unknowns vs. Difficulty:**
  - *Hard but Low Risk:* Building an internal authentication service with JWTs. Complex, but 100% under our control with well-understood documentation.
  - *Risky:* Integrating a third-party payment gateway or external KYC API. Governed by external rate limits, asynchronous webhooks, sandbox discrepancies, and third-party downtime.

---

## 2. Micro-Exercise: Ranking Tasks by Technical Risk

### Tasks Evaluated:
1. **Task A:** Design a new database schema for storing provider profiles (fields, types, indexes).
2. **Task B:** Integrate a third-party payment API (Stripe) to process bookings.
3. **Task C:** Build a CRUD form for users to edit their own profiles.

### Risk Ranking & Engineering Rationale:
1. **Rank 1 (Highest Risk): Task B — Integrate Third-Party Payment API (Stripe)**
   - *Why Highest:* Governed by external dependencies outside our direct control. Carries high unknowns: webhook idempotency, asynchronous payment authorization vs. capture, escrow holding rules, refund fee handling, and regulatory compliance (PCI-DSS / SCA). If payment integration fails or rate limits block throughput, the entire marketplace business model is invalidated.
2. **Rank 2 (Medium Risk): Task A — Database Schema Design for Provider Profiles**
   - *Why Medium:* 100% within our direct control, but architectural blast radius is significant. Schema choices, index selections, and foreign key relationships dictate query performance and migration complexity for every downstream feature. Getting it wrong causes expensive data migration rework.
3. **Rank 3 (Lowest Risk): Task C — Profile CRUD Form**
   - *Why Lowest:* Zero external dependencies, standard well-understood UI/API patterns (HTTP PUT/PATCH with input validation), and isolated blast radius. A bug in a profile bio field never threatens platform solvency or stops bookings from executing.
