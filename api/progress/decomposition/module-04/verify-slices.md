# Module 04: Vertical Slicing — Verification & Clickthrough Test

## 1. The Clickthrough Test: Can I test Slice 1 without reading any code?

### Step-by-Step Human Walkthrough Narration:
1. **Open Browser:** I open Google Chrome and navigate to the application URL (`http://localhost:3000`).
2. **Homepage Inspection:** I see a clean, professional web page titled *"SkillSwap — Connect & Learn with Expert Mentors"*. On the page are 3 prominent provider cards:
   - **Alice:** Calculus Tutor | 5.0 ★ | $40/hr
   - **Bob:** Acoustic Guitar Instructor | 4.9 ★ | $35/hr
   - **Charlie:** Full-Stack Web Development Coach | 4.8 ★ | $50/hr
3. **Select Provider:** I click on Alice's card. The view smoothly transitions to Alice's profile page. I see her headline, a short bio explaining her teaching approach, and a section labeled *"Available Sessions (60 Min)"* displaying 3 clickable time slot buttons:
   - `Tomorrow at 10:00 AM`
   - `Tomorrow at 2:00 PM`
   - `Friday at 11:00 AM`
4. **Choose Slot:** I click on `Tomorrow at 10:00 AM`. The button highlights with an active blue border, and a green primary button labeled `Confirm Booking` appears below.
5. **Execute Booking:** I click `Confirm Booking`. A brief loading indicator appears, and within 300ms, the screen transitions to an order confirmation view displaying:
   - A green checkmark and headline: *"Your session with Alice is confirmed!"*
   - Reference Number: `#BK-1001`
   - Service: `Calculus 101 (60 minutes)`
   - Time: `Tomorrow at 10:00 AM`
   - Notice: *"Introductory free session — no payment required."*
6. **Verify State Persistence:** I hit Chrome's Refresh button (`F5`). The confirmation screen reloads immediately with the exact same details and booking reference, confirming it is not just transient memory.
7. **Verify Inventory Depletion:** I click the *"Back to Mentors"* link, click back into Alice's profile, and observe that `Tomorrow at 10:00 AM` is now disabled and labeled `Booked`, leaving only the 2:00 PM and Friday slots available.

**Non-Technical Audit Conclusion:**
At no point did the reviewer look at source code, inspect network tabs, check database tables, or verify terminal logs. The entire slice was exercised, validated, and verified strictly through the human-facing web interface.

---

## 2. Product Learning vs. Technical Verification

### What is the ONE thing we learn from this slice that we did not know before building it?

> **The Core Product Learning:**
> **We learn whether prospective students are willing to book an expert mentor directly off a profile card, or whether they experience friction and demand pre-booking messaging before committing to a time slot.**

### Why this matters (Product Hypothesis vs. Technical Confirmation):
- **What is NOT product learning:** *"We learned NestJS handles HTTP POST requests and PostgreSQL persists rows without race conditions."* That is technical verification. Technical plumbing can always be made to work.
- **What IS product learning:** In two-sided service marketplaces, there is a fundamental split between two paradigms:
  1. *Direct Booking (Calendly/Airbnb model):* User sees availability and immediately books a slot.
  2. *Inquiry-First (Upwork/Thumbtack model):* User requires an asynchronous conversation ("Do you teach AP Calculus BC specifically?") before booking.
- By placing Slice 1 in front of 5 target users on Day 1, we immediately see their behavior:
  - Do they comfortably pick a slot and click "Confirm Booking"?
  - Or do they hesitate, look around for a "Message Alice" button, and express doubt about whether Alice is the right fit for their specific topic?
- If users refuse to book without asking questions first, we learn that **messaging is an existential requirement prior to payments**, altering our entire product roadmap before writing a single line of Stripe code.

---

## 3. Red Flags Audit of Slice Definitions

| Red Flag | Audit Evaluation | Status |
|---|---|:---:|
| **Too Thick?** | Slice 1 excludes auth, payments, emails, search, notifications, and cancellations. It takes 2–3 hours to implement end-to-end. | **PASSED** |
| **Too Thin?** | Slice 1 is not a mock static page or an isolated API endpoint. It traverses all layers (UI -> API -> DB -> UI update) and persists state across page reloads. | **PASSED** |
| **Vague Anti-Scope?** | Anti-scope explicitly itemizes 9 concrete capabilities that a stakeholder might inquire about (auth, payments, email, search, provider portal, cancellation, Google Cal sync, reviews, admin dashboard). | **PASSED** |
| **Non-Technical Acceptance Criteria?** | All acceptance criteria describe concrete user actions (click, observe screen, refresh) with zero references to HTTP codes, JSON keys, or SQL tables. | **PASSED** |
| **Slices Build on Each Other?** | Strict cumulative progression: Slice 1 establishes full-stack flow -> Slice 2 ties it to authenticated users -> Slice 3 replaces seed providers with real provider self-service -> Slice 4 layers payments onto real bookings -> Slice 5 layers cancellation/refunds onto real payments. | **PASSED** |
