# Module 01: BREAK — The Contradictory Specification Incident

## 1. The Contradiction Pinpointed
The updated spec introduces a direct, irreconcilable contradiction between two competing cancellation architectures:

1. **The Provider-Autonomy Model (Original Spec):**
   - *"Providers set their own availability, pricing, and descriptions... Users can cancel bookings with the provider's cancellation policy applied."*
   - Gives providers autonomy over their inventory, risk, and refund rules.
2. **The Universal Platform-Mandate Model (Updated Spec):**
   - *"To ensure a consistent user experience, all cancellations made within 24 hours of booking receive a full refund, regardless of the reason. Cancellations after 24 hours are non-refundable."*
   - Imposes a rigid, global platform rule that completely nullifies provider autonomy.

---

## 2. Deeper Failure Modes: The "Time of Booking" vs. "Time of Appointment" Bug
Beyond the governance conflict, the updated wording introduces a critical semantic defect:
- The update states: *"within 24 hours of booking"* (relative to the **booking creation timestamp**), NOT *"within 24 hours of the scheduled appointment"* (relative to the **session start time**).
- **Failure Scenario 1 (Far Future Booking):**
  - Alice books Bob (a top guitar tutor) 30 days in advance.
  - On Day 3 (27 days before the lesson), Alice has an emergency and needs to reschedule.
  - Under *"cancellations after 24 hours of booking are non-refundable"*, Alice is charged 100% and receives $0 refund, even though Bob has 27 days notice to re-list the slot! Support and customer trust collapse.
- **Failure Scenario 2 (Last-Minute Booking & Provider Harm):**
  - Charlie books a math session scheduled for 3:00 PM today at 1:00 PM (2 hours before the session).
  - At 2:50 PM (10 minutes before the session), Charlie cancels.
  - Because only 1 hour and 50 minutes have elapsed since booking, it is *"within 24 hours of booking"*. Charlie gets a 100% full refund!
  - The provider turned away other students, prepped for the lesson, and receives $0.

---

## 3. Engineering & Business Impact If Built Without Resolving
- If engineers implement the provider policy model, the platform fails the PM's "consistent user experience" objective.
- If engineers implement the 24h booking timestamp model, provider churn spikes due to last-minute cancellations, and customer chargebacks spike on advance bookings.
- The root cause is conflicting stakeholder inputs (Ops vs. Product vs. Provider Relations) patched into the spec without an integrated impact analysis.
