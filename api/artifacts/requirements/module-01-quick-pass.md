# Module 01: Quick Pass Requirements Starter

## 1. Five Explicit Requirements from the Spec
1. Users can browse service providers by category and view detailed provider profiles with user ratings.
2. Users can book available time slots and complete payments directly through the platform.
3. Providers can configure their own calendar availability, session pricing, and service descriptions.
4. The platform captures a fixed 15% commission fee on all provider session earnings.
5. Users receive automated confirmation emails upon booking and can cancel bookings with the provider's specific cancellation policy applied.

## 2. Two Ambiguities We Are Least Sure About
1. **Cancellation Refund & Inventory Release Mechanics:** The spec states that cancellations apply the provider's policy, but fails to define whether provider policies are structured tiers (e.g. 24h cutoff = 100% refund, <24h = 0%) or arbitrary text, whether platform commission is retained on refunds, and whether canceled time slots immediately unlock in the search catalog.
2. **Search Performance & Instant Query Latency:** The spec requires that search must "feel instant," but provides no quantitative latency budget (p95 / p99 SLA under target load), indexing strategy, caching policy, or filtering criteria across multiple cities.

## 3. One Direct Question for the Product Manager Right Now
*"Does the 15% platform commission apply uniformly to all service categories, and in the event of a customer dispute or late cancellation with partial refund, is the platform commission deducted from the refund pool or waived?"*
