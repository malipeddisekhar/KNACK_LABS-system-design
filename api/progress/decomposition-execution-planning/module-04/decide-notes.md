# Module 04: Vertical Slicing — Decisions

## Decision 1: Slice Boundary (`decisions.module_04.slice_boundary`)
- **Choice:** `Option B: Demand side first (demand_first)`
- **Reasoning:**
  1. **Core Value Hypothesis Testing:** In a two-sided marketplace, the fundamental existential risk is whether demand exists and whether users will navigate the conversion funnel to book a service. Building provider registration first (supply side) tests data entry forms, not the marketplace transaction value.
  2. **Stakeholder & User Clickability:** Demand-side first provides an immediate, tangible demo where stakeholders can click through provider cards, pick a time slot, click "Book", and receive confirmation. Stakeholders can validate UX and value immediately.
  3. **Data Dependency Asymmetry:** Demand requires provider data, but that data can trivially and safely be seeded (3 hardcoded realistic providers). Conversely, supply-side registration creates provider data that sits inert with no consumer interface.

## Decision 2: MVP Scope (`decisions.module_04.mvp_scope`)
- **Choice:** `ultra_thin`
- **Scope Definition:**
  - **Included:**
    - 3 hardcoded providers (Alice - Math, Bob - Guitar, Charlie - Coding)
    - 1 service per provider
    - 1 static slot per provider
    - 1 single-action "Book Slot" button
    - 1 API endpoint `POST /api/v1/bookings`
    - 1 atomic DB transaction persisting the booking record
    - 1 instant visual confirmation view displaying the booking ID
  - **Explicitly Excluded:**
    - Authentication / JWT login (hardcoded `user_id = "test-user-1"`)
    - Payment gateway / Stripe integration (bookings marked `payment_status = "FREE_TRIAL"`)
    - Search bar, category filters, sorting, pagination
    - Dynamic calendar grid / multi-timezone conversion
    - Cancellation / rescheduling / refund flows
    - Email / SMS notification dispatch
    - Reviews, ratings, and messaging
- **Justification:**
  - Keeps build and verification time strictly under 2 hours.
  - Proves the full end-to-end multi-tier architectural pipeline (Client UI -> REST API -> Business Validator -> DB Persistence -> UI Confirmation State) without introducing extraneous points of failure.
