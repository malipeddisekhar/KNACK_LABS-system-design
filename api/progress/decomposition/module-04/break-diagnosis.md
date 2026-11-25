# Module 04: Vertical Slicing — Break Diagnosis (Stakeholder Pressure Test)

## 1. Scenario Summary
- **The Event:** Friday at 4:47 PM, the PM requests injecting real Stripe test-mode payments into the first demo for a lead investor meeting next Friday.
- **The Stated Concern:** The investor wants to "see money flow through the platform" and finds a booking-without-payment demo "concerning".
- **The Conflict:** Payment processing was explicitly placed in Slice 1's anti-scope to avoid conflating core booking UX with third-party payment integration risks.

---

## 2. Evaluation of Strategic Responses

### Response A: Capitulation (Expand Slice 1 to include payments)
- **What it is:** Agree to shoehorn Stripe test-mode checkout into Slice 1 before next Friday.
- **Why it is hazardous:**
  - Roughly doubles build scope and time (card tokens, backend authorization endpoints, webhook listeners, escrow state management, error handling).
  - High probability of being incomplete or fragile by Friday morning. If a Stripe webhook fails or network latency spikes during the meeting, the investor sees a broken product and concludes the entire platform is broken.
  - Conflates two distinct hypotheses: "Does the booking flow work for users?" and "Does the payment gateway process money?" If something breaks, root-cause isolation is obfuscated.

### Response B: Decoupled Payment Spike (Slice 1.5)
- **What it is:** Protect Slice 1 as an independent, rock-solid booking demo. Build a fast, standalone payment proof (`/demo/payment-proof`) that processes a test charge via Stripe Elements and shows real money flow and receipt generation.
- **Advantage:** Gives the investor 100% of the evidence they need ("money flowing through Stripe test mode") while keeping the booking demo completely insulated from payment failures.

### Response C: Push Back Purely on Timeline & Principles
- **What it is:** Decline the request outright, citing previous risk assessments and offering only a verbal roadmap.
- **Risk:** Ignores the legitimate business context. Lead investors often have specific thesis questions ("Is this team capable of building transactional fintech, or is this just another calendar widget?"). Saying flatly "no" can jeopardize funding.

---

## 3. The Recommended Strategy: The Decoupled Two-Part Demo (Synthesis of B & C)

### The Core Recommendation:
We do NOT expand Slice 1. Instead, we preserve Slice 1's integrity and introduce **Slice 1.5 (A Standalone Payment Proof Spike)**, presenting a structured two-part investor demonstration:

1. **Part 1 — The Marketplace Experience (Slice 1):**
   - Live demo of the student booking Alice for Calculus at 10:00 AM, proving demand-side UX, slot locking, and state persistence.
2. **Part 2 — The Transaction Engine (Slice 1.5):**
   - Live demo on a dedicated verification route (`/demo/payment-flow`) demonstrating a real charge processed through Stripe test mode:
     - Enters test Visa card credentials.
     - Hits Stripe Test API to authorize a $40 payment hold.
     - Triggers capture and displays real Stripe Charge ID (`ch_3M...`), platform 10% fee deduction ($4.00), and escrow balance.

### What We Are Trading Away:
- **What we give up:** Having the payment input embedded *inside the exact modal* of the booking flow for next Friday.
- **What we gain:**
  - **Zero Catastrophic Failure Risk:** If the payment spike experiences API rate limits or network issues, the booking marketplace demo remains 100% functional and demonstrable.
  - **Schedule Predictability:** Slice 1 finishes by Tuesday; Slice 1.5 finishes by Thursday. Friday has zero crunch.
  - **Investor Credibility:** The investor sees actual funds moving through Stripe test mode AND sees an engineering team that manages technical risk with maturity instead of rushing buggy monolithic code.

### Drafted PM Response Message:
> "Hey [PM], completely understand the investor's focus on transactional monetization. We can show them real money flowing through Stripe test mode next Friday without putting the entire demo at risk.
>
> If we merge payments directly into the booking modal this week, we double our build surface and risk having a broken demo on Friday if Stripe webhooks hiccup. Instead, here is our plan:
> 1. We finish Slice 1 (the booking flow) by Tuesday so we have a guaranteed working marketplace demo in hand.
> 2. We build a standalone Payment Spike (Slice 1.5) by Thursday that live-charges a test credit card through Stripe, captures the hold, and displays the Stripe transaction ID and fee breakdown.
>
> In the meeting, we show Part 1 (the marketplace booking UX) and Part 2 (the live Stripe transaction engine). The investor sees money moving live, and we guarantee a zero-crash demo. Let me know if that works!"
