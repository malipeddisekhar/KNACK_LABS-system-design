# Module 03: FIX — Adapting the Plan Around External Business Blockers

## 1. Isolating the Blocked Work

| Domain Surface | Status | Action Required |
| :--- | :--- | :--- |
| **Real Money Movement & Gateway API** | **TRULY BLOCKED** | Awaiting client legal entity incorporation & Stripe merchant account underwriting. |
| **Payment Interface & Contract** | **UNBLOCKED** | Define `IPaymentGateway` interface contract immediately. |
| **Booking Checkout Integration** | **UNBLOCKED** | Connect booking flow to `MockPaymentGateway` returning deterministic mock transaction IDs. |
| **Transaction & Escrow Data Model** | **UNBLOCKED** | Implement PostgreSQL `transactions` and `escrow_ledger` tables using UUID transaction keys. |
| **Cancellation & Refund State Machine**| **UNBLOCKED** | Implement refund calculation logic invoking `mockPaymentGateway.refund()`. |

---

## 2. The Stubbed Interface Contract (`IPaymentGateway`)

```typescript
export interface PaymentIntentRequest {
  bookingId: string;
  learnerId: string;
  providerId: string;
  grossAmountCents: number;
  currency: string;
}

export interface PaymentIntentResult {
  status: 'AUTHORIZED' | 'CAPTURED' | 'FAILED';
  transactionId: string;
  platformFeeCents: number;
  netProviderCents: number;
  timestamp: string;
}

export interface RefundRequest {
  transactionId: string;
  refundAmountCents: number;
  reason: 'COOLING_OFF' | 'TIER_CANCELLATION' | 'DISPUTE';
}

export interface IPaymentGateway {
  processPayment(request: PaymentIntentRequest): Promise<PaymentIntentResult>;
  processRefund(request: RefundRequest): Promise<{ status: 'REFUNDED'; refundId: string }>;
}
```

- **In-Memory / Dev Mock Adapter:**
  - Validates amount > 0, calculates 15% platform fee, returns `status: 'CAPTURED'`, and outputs a deterministic `txn_mock_<uuid>`.
  - Enables 100% of the checkout, booking confirmation, cancellation refund, and audit ledger tests to execute without external network calls.

---

## 3. Two-Sentence PM Escalation Message

> **To:** Product Manager / Client Stakeholder  
> **Subject:** URGENT: Payment Gateway Blocked — Legal Merchant Account Required  
> *"Payment processing is currently blocked because the client has no Stripe account, legal business entity, or merchant acquiring paperwork in place. We have implemented a stubbed `IPaymentGateway` interface so that booking, cancellation, and provider workflows continue unblocked, but live payment capture and payout verification cannot occur until merchant onboarding finishes — can you confirm an estimated completion date for the business entity and merchant account?"*

---

## 4. Team Execution Plan & Re-Prioritized Build Order

While live Stripe integration is parked on an external blocker queue:
1. **WI-06 (Booking Engine Concurrency Mutex)** and **WI-02 (Multi-City Listings Model)** take top priority, absorbing senior engineering bandwidth.
2. The team builds end-to-end against `MockPaymentGateway`.
3. When the merchant account clears, live Stripe webhook integration (`WI-07b`) drops in as a clean adapter implementation with zero downstream disruption.

### Revised Risk-First Build Sequence

| Order | Work Item ID | Name | Status | Rationale |
| :---: | :--- | :--- | :--- | :--- |
| **1** | **WI-02** | Listings & Multi-City Catalog Model | Active (Risk: 4) | Foundational schema; multi-city partitioning prevents downstream schema rework. |
| **2** | **WI-01** | User Authentication & RBAC | Active (Risk: 2) | Unblocks learner, provider, and admin identities across all endpoints. |
| **3** | **WI-03a**| Admin Review Tool (Minimal) | Active (Risk: 1) | Cycle-breaker; lightweight approval endpoint for provider vetting. |
| **4** | **WI-07a**| **Payment Interface Contract & Stub** | **NEW / ACTIVE** | **Replaces live payments.** Establishes `IPaymentGateway` and mock adapter. |
| **5** | **WI-04** | Availability & Slot Schedule Engine | Active (Risk: 2) | Slot generation and blackout logic needed for concurrency tests. |
| **6** | **WI-06** | Booking Engine & Concurrency Slot Mutex | Active (Risk: 4) | High novelty risk; implements distributed locking using mock payment tokens. |
| **7** | **WI-05** | Instant Search & Category Taxonomy | Active (Risk: 3) | Validates p95 < 100ms caching and indexing while team bandwidth is open. |
| **8** | **WI-03b**| Provider Onboarding & KYC Pipeline | Active (Risk: 3) | Operationalizes provider submission to the minimal review tool. |
| **9** | **WI-09** | Cancellation Engine & Refund Flow | Active (Risk: 3) | Evaluates cancellation policies and triggers mock refunds. |
| **10**| **WI-12** | Financial Audit Ledger & Telemetry | Active (Risk: 3) | Records mock double-entry transactions and telemetry events. |
| **11**| **WI-08** | Notification Queue & Email Dispatch | Active (Risk: 2) | Asynchronous BullMQ mailer consuming booking and cancellation events. |
| **12**| **WI-10** | Review System & No-Show Flagging | Active (Risk: 1) | Post-session review submission linked to completed bookings. |
| **13**| **WI-11** | Full Admin Dashboard & Operations | Active (Risk: 1) | Reporting dashboards and dispute arbitration. |
| **GATE**| **WI-07b**| **Live Stripe Integration & Connect Payouts**| **BLOCKED (External)**| **Awaiting client merchant account and legal entity verification.** |
