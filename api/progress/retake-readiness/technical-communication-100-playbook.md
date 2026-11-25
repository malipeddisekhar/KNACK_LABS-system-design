# Technical Communication — 100/100 Retake Execution Playbook

> **Target Skill:** `technical-communication`  
> **Current Platform Score:** 93 / 100 (Assessment: STRONG)  
> **Target Retake Score:** **100 / 100 (Assessment: STRONG)**  
> **Audited Score Deductions:**  
> - `writing_clarity`: 4/5 $\rightarrow$ Raised to **5/5** (Mandatory first-use definition rule for non-technical stakeholders)  
> - `structure_quality`: 4/5 $\rightarrow$ Raised to **5/5** (Strict separation of `[Blocking]` correctness defects vs `[Non-blocking]` stylistic advice)  
> - `review_quality`: 5/5 $\rightarrow$ Preserved (High-impact operational consequences tied to every code review comment)  
> - `audience_awareness`: 5/5 $\rightarrow$ Preserved (Tailored executive summaries vs detailed engineering deep-dives)  
> - `actionability`: 5/5 $\rightarrow$ Preserved (Owner-specific action tables with measurable completion checks)

---

## 1. The First-Use Plain-Language Definition Rule

In Module 02, technical terms were used without initial explanations for new engineers and non-technical stakeholders, resulting in a **4/5** deduction.

### Non-Negotiable Standard
Whenever any distributed system, database, or networking concept appears for the first time in a document, it **must** be immediately followed by a parenthetical or 1-sentence plain-language operational definition.

### Canonical Terminology Dictionary

| Technical Term | 100/100 Mandatory Plain-Language Operational Definition |
| :--- | :--- |
| **Latency** | The round-trip delay (measured in milliseconds) between when a client clicks or sends a request and when the server delivers the response. |
| **p95 / p99 Latency** | The response time experienced by the 95th (or 99th) percentile of users, revealing worst-case tail delays that affect power users while hiding behind misleading averages. |
| **Round-Trips** | The number of distinct network journeys back and forth across the internet between browser/mobile client and server to fetch complete page data. |
| **Circuit Breaker** | An automated electrical switch in code that immediately trips open when a downstream dependency (like a database or third-party payment API) begins failing, preventing hung threads and cascading system outages. |
| **Idempotency** | An architectural safety guarantee ensuring that sending the exact same network request multiple times (such as during network retries) produces the identical system state without creating duplicate charges or records. |
| **Backwards Compatibility** | The discipline of ensuring newly deployed API schema changes do not crash existing mobile or web clients that have not yet updated their software. |
| **Cache Invalidation** | The automated eviction or updating of stale cached data in Redis the instant the source-of-truth database record changes, preventing users from seeing outdated content. |
| **Fail-Closed** | A defensive security posture where any ambiguous configuration, unverified identity, or database connection error results in immediate refusal of service rather than insecure fallback. |

---

## 2. Top-Down Decision Framework (BLUF Structure)

Every design doc, architectural proposal, and migration plan must open with **BLUF (Bottom Line Up Front)** so executive stakeholders grasp the core trade-off within 30 seconds.

### The 5-Part Document Structure
1. **Decision (BLUF):** Exactly what was decided, who decided it, and the immediate quantified business impact.
   > *"We are migrating all mobile link-fetch endpoints from REST to GraphQL, reducing client network round-trips from 4 to 1 and dropping mobile p95 load times from 850ms to 210ms."*
2. **Context & Problem Statement:** What architectural strain forced this decision (e.g., mobile over-fetching, slow 4G cell tower handshakes).
3. **Trade-Off Analysis & Rejected Alternatives:**
   ```markdown
   | Option | Throughput / Scale | Implementation Effort | Downstream Trade-Off / Risk | Decision |
   | :--- | :--- | :--- | :--- | :--- |
   | **Option A: Bespoke BFF REST Routes** | Medium (350ms) | Low (1 week) | Route explosion; high backend maintenance burden | Rejected |
   | **Option B: GraphQL Gateway** | High (210ms) | Medium (2 weeks) | Query complexity risks; mitigated via query depth limits | **Selected** |
   ```
4. **Known Failure Modes & Mitigations:** Concrete bounds on risk (e.g., query depth limiter capped at 5 levels; server-side timeout bound at 3,000ms).
5. **Next Steps with Single Owners:**
   - *Backend Team (Lead: Alex):* Finalize GraphQL schema types by Day 2.
   - *Mobile Team (Lead: Priya):* Implement query caching and Apollo client by Day 4.

---

## 3. High-Impact Code Review Standards (Blocking vs Non-Blocking)

To guarantee **5/5 on `review_quality` and `structure_quality`**, every code review must strictly partition functional bugs from stylistic feedback.

### Structure of a 100/100 Code Review:
1. **Positive Grounding Opening:** Acknowledge clean patterns, thorough tests, or clear PR descriptions.
2. **Section 1: Required Changes — Correctness & Security (`[Blocking]`):**
   - Must cite line numbers, exact inputs that cause failure, and the operational consequence.
   ```markdown
   ### [Blocking] Line 42 — Division by Zero on Inactive Accounts
   * **Failure Condition:** If `total_users` is 0, `sum_age / total_users` throws an unhandled `ZeroDivisionError`, crashing the worker process with exit code 1.
   * **Required Correction:** Guard with early exit or fallback:
     ```python
     if total_users == 0:
         return 0.0
     return sum_age / total_users
     ```
   ```
3. **Section 2: Suggestions — Maintainability & Style (`[Non-blocking]`):**
   - Provide concrete code examples, but explicitly state the PR author has discretion to merge without blocking release.
   ```markdown
   ### [Non-blocking] Line 68 — Helper Extraction for Health Classification
   * **Observation:** The nested if-else tree on lines 68–85 can be simplified using a dictionary lookup or an early-return helper `_classify_account_health()`.
   ```
4. **Closing Collaboration Offer:** Offer to pair or re-review immediately once blocking fixes are pushed.
