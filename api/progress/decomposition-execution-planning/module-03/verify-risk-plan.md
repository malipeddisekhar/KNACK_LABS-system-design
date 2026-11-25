# Module 03: VERIFY — Stress-Testing the Risk-First Execution Plan

## 1. Walkthrough of the First Three Build Items

### What is learned and which risks are retired after Items 1, 2, and 3?
- **Spike Phase (Pre-Build Day 1):**
  - *SPIKE-01 (Stripe Connect & Webhooks):* Tests whether payment authorization, webhook delivery, escrow holds, and refund fee logic operate as expected in the Stripe sandbox. Retires **Integration Risk** on WI-07 before committing production code.
  - *SPIKE-02 (Redis Mutex Locking):* Validates atomic slot acquisition under high concurrent curl requests. Retires **Novelty Risk** on WI-06.
- **Item 1: WI-02 (Listings & Provider Catalog Model):**
  - Retires **Scale & Dependency Risk**. Proves that the schema natively supports multi-city filtering, categories, and provider profiles without needing breaking migrations when scaling across 5 cities.
- **Item 2: WI-01 (User Authentication & RBAC):**
  - Retires foundational **Dependency Risk**. Establishes validated JWT session tokens, password hashing, and role checks (Learner, Provider, Admin) required by all downstream endpoints.
- **Item 3: WI-03a (Admin Review Tool - Minimal):**
  - Breaks the circular dependency identified in Module 02. Delivers a lightweight `PATCH /admin/providers/:id/status` endpoint in half a day, unblocking provider onboarding without waiting for the full admin dashboard.

---

## 2. Early Failure Analysis: The Value of Rapid Feedback
- **Question:** If Item 1 fails completely (e.g., PostgreSQL query planner performance on category-city joins is unacceptable under target catalog size), what do we still know, and what have we wasted?
- **Analysis:**
  - *What is Wasted:* Exactly **2 days of schema work**.
  - *What is Gained:* Total clarity on query planner bottlenecks and index needs before building the Search API, Booking flow, or Admin dashboards.
  - *The Contrast:* If we had followed comfortable CRUD ordering (building UI and profile forms for 30 days) and deferred the complex listings schema to the end, discovering the data model flaw would have invalidated 30 days of frontend forms, mock contracts, and API routes. Failing on Day 2 is cheap; failing on Day 30 is fatal.

---

## 3. Targeted Push: Auth as Item 2 — Foundational vs. Risky
- **The Core Distinction:**
  - *Risk asks:* "How likely is this to fail, surprise me, or hit third-party unknowns?"
  - *Dependency asks:* "How many other components are blocked until this exists?"
- **The Verdict on Auth:**
  - Auth is **Low Risk (Score: 2)**: It is a solved, well-documented problem using mature libraries (Passport, JWT, bcrypt). It carries minimal technical novelty.
  - Auth is **High Dependency**: It sits near the top of the DAG because bookings and provider profiles require verified user identities.
  - **Why Auth is Positioned as Item 2:** We build Auth early *not because it is scary*, but because it is the prerequisite needed to unblock the genuinely scary, high-risk items (concurrency locking in WI-06 and escrow payments in WI-07). Conflating "foundational" with "risky" is a novice trap; mature planning distinguishes between prerequisite enablers and high-uncertainty risks.

---

## 4. Additional Verification Checks

### Hidden Risks in the Bottom 3 Items
- **WI-08 (Notification Queue):** Bottom-tier leaf node, but external SMTP deliverability (spam filters, gateway throttling) is an integration risk.
  - *Mitigation:* We placed it behind an asynchronous BullMQ Redis queue with exponential backoff and retry dead-letter queues.

### The 5-Item Demo Test
- If limited to only 5 items before an investor/stakeholder demo, we build:
  1. `WI-02 (Listings Model)`
  2. `WI-01 (User Auth)`
  3. `WI-04 (Availability Engine)`
  4. `WI-06 (Booking Engine with Mutex)`
  5. `WI-07 (Payment Processing & Escrow)`
- *Alignment:* This matches our risk-first sequence exactly and delivers a complete, revenue-generating end-to-end vertical slice!

### Spike Placement Strategy
- Two scouting spikes are scheduled on **Day 1 morning**:
  - `Spike 1 (Stripe API & Webhook Escrow)` placed immediately before WI-07.
  - `Spike 2 (Redis Mutex Concurrency)` placed immediately before WI-06.
- Total cost: 4 hours. Potential savings: weeks of architectural rework.
