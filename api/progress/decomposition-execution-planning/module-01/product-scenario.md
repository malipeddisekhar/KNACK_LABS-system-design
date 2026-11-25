# Canonical Product Scenario: SkillSwap

## Product Summary
- Two-sided marketplace for skill-based sessions.
- **Providers:** Publish service offerings, calendar availability, hourly/session pricing, and verified profiles.
- **Learners:** Search & discover services, book time slots, pay via platform escrow, receive booking confirmations and notifications.
- **Admin / Operations:** Provider vetting/verification, dispute resolution, platform analytics, payout reconciliation.

## Core Planning Constraints
1. **Search Performance:** Instant search queries under target catalog and query load.
2. **Concurrency & Double-Booking:** Deterministic slot locking to prevent concurrent double-booking of provider time slots.
3. **Cancellation & Refunds:** Explicit, state-machine-driven cancellation policies with deterministic refund windows.
4. **Financial Consistency:** Platform commission calculation and provider payout logic must remain strictly consistent and auditable.
5. **Multi-Region Scalability:** Expanding from a single pilot city to multi-city operations must not require a structural schema or architectural rewrite.

## Scenario Anchor
- Scenario key recorded in `progress/state.json`: `"skillswap"`.
- All decomposition artifacts across Modules 01–08 link to this shared domain model.
