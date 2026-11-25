# Module 03: BREAK — The Non-Technical External Blocker (No Merchant Account)

## 1. Incident Breakdown
The client reveals that no Stripe account exists, no legal corporate entity is incorporated, and no merchant banking paperwork has begun. The legal and financial infrastructure to accept payments does not exist.

---

## 2. Risk Classification & Nature of the Blocker
- **Risk Type:** **External Business & Regulatory/Compliance Risk** (Non-Technical).
- **Why It Transcends Technical Risk:**
  - The four original categories (Integration, Novelty, Dependency, Scale) assume that the external system exists and that the problem is technical integration.
  - Here, the problem is **legal prerequisite failure**. No amount of engineering ingenuity, refactoring, or alternative libraries (PayPal, Braintree, Square) can solve the fact that the client cannot legally collect or disburse customer funds.
  - A senior engineer does not attempt to solve legal blockers with code; a senior engineer **adapts the architecture and execution sequence** around the reality of the blocker.

---

## 3. Plan Impact & Strategic Adaptation
In our Module 02 DAG, we classified payment dependencies on downstream features (Cancellation, Reviews, Notifications) as **Soft Dependencies (S)**. That architectural decision now saves the project:

### 1. What happens to the high-risk payment plan?
- We bifurcate `WI-07 (Payment Processing)` into two distinct components:
  - **WI-07a: Payment Gateway Interface & In-Memory Mock Adapter (`IPaymentGateway`):** Built immediately. Implements mock authorization, escrow vaults, and 15% commission ledger calculations with deterministic test cards.
  - **WI-07b: Live Stripe Production Integration & Payout Onboarding:** Deferred to a dependency gate awaiting the client's verified legal entity and merchant credentials.

### 2. Can we still make progress on the rest of the system?
- **Yes, 100% of the remaining system can be built and verified.**
- Using `IPaymentGateway`:
  - `WI-06 (Booking Engine)` locks slots and receives mock transaction IDs (`txn_mock_123`).
  - `WI-09 (Cancellation Engine)` executes 100% and 50% refund state transitions against the mock adapter.
  - `WI-10 (Review System)` submits ratings against completed bookings.
  - `WI-05 (Search & Browse)` and `WI-03 (Provider Onboarding)` proceed with zero payment dependency.
- When the client's legal entity clears and Stripe keys are provisioned, swapping `MockPaymentGateway` for `StripePaymentGateway` is a 1-day adapter swap behind an already-verified interface contract.
