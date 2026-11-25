# Module 07 Context: Mid-Build Adaptation & Blast Radius

## 1. Mid-Build Adaptation Mental Model
Mid-build requirement changes are an inherent reality of software engineering, especially in fast-moving product cycles. The core skill is not preventing change, but avoiding the two failure modes:
1. **Panic and Restart:** Throwing away working code, committed tests, and established architecture to "start fresh." This wastes momentum and capital.
2. **Denial and Absorption:** Pretending scope increases have zero cost, leading to crunch, broken contracts, and quiet failures.
3. **Structured Recalculation (The GPS Model):** Rerouting from the current coordinates. Assess the actual blast radius, preserve completed foundations, prune non-essential secondary scope, and re-contract the active seam.

---

## 2. Case Study Analysis: Roomly (Hack vs. Proper)
- **Scenario:** 3 weeks into a 4-week sprint, an enterprise client requires multi-tenancy across 40 locations.
- **The Pragmatic Adaptation:** Added an `organization_id` foreign key column, scoped queries via NestJS/Express request middleware, and shipped in 8 days.
- **Trade-off:**
  - *Speed to Value:* Secured revenue immediately, allowing the team to fund a comprehensive multi-tenant architecture in the subsequent quarter.
  - *Caution:* If technical debt is not tracked and scheduled for repayment, "temporary" shims become brittle legacy burdens. The decision must be deliberate, documented, and bounded.

---

## 3. Micro-Exercise: Blast Radius Assessment
**Initial Plan (60% Complete):**
- **Ticket A:** User Authentication — DONE (JWT, password hashing).
- **Ticket B:** Service Listing Page — IN PROGRESS (70% done; name, category, rating, search working; pagination pending).
- **Ticket C:** Booking Flow — NOT STARTED (provider selection, slot selection, confirmation).

**Requirement Change:** *"Users need to see provider availability on the listing page before clicking into a provider's profile."*

### Blast Radius Matrix:
| Ticket | Status | Blast Radius | Impact Analysis & Tactical Action |
|---|---|---|---|
| **Ticket A: User Auth** | DONE | **None (0%)** | Zero impact. Authentication tokens and user identity pipelines do not touch availability calculation. |
| **Ticket B: Service Listing** | IN PROGRESS (70%) | **High (Direct Hit)** | **API Contract:** Modify `GET /providers` response DTO to include `nextAvailableSlot: string \| null` and `hasAvailability: boolean`.<br>**Database/Performance:** Prevent N+1 query disaster by batching slot lookups using PostgreSQL `JOIN` or Redis availability cache.<br>**UI Component:** Update provider card to render availability pills. |
| **Ticket C: Booking Flow** | NOT STARTED | **Medium (Structural Shift)** | **Shift Logic Left:** Move primary date/slot selection awareness to the listing card.<br>**Simplification:** Provider profile page changes from a discovery screen into a direct booking confirmation screen, potentially reducing Ticket C's build time. |

### Severity Assessment:
- **Classification:** Moderate "Bowling Ball" with contained radial cracks.
- **Mitigation:** Protect Ticket A's completed state, amend Ticket B's DTO interface contract before finishing pagination, and re-scope Ticket C to consume the listing page's selected slot.
