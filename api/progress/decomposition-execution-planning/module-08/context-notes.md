# Module 08 Context: Integration, Seams, and Requirements Traceability

## 1. Why Integration Is an Independent Skill
- **Core Axiom:** *Individual correctness does not guarantee system correctness.*
- In modern software development, teams and autonomous AI agents build modular components that achieve 100% test coverage and satisfy local unit assertions in isolation.
- Integration failures do not happen inside components; they happen in the **seams** between them—subtle mismatches in serialization types, datetime conventions, error envelopes, and unstated domain assumptions.

---

## 2. Case Study Analysis: Healthcare.gov (October 2013)
- **Failure:** A \$1.7 billion system built by 55 separate contractors crashed under a load of just 5 concurrent users on launch day.
- **Root Cause:** Total absence of centralized integration governance. Each contractor tested their module in silos with mocked data. Nobody tested the end-to-end user journey across contractor boundaries until launch week.
- **Engineering Lesson:** Integration cannot be an afterthought or a "merge-and-pray" sprint. It requires continuous contract verification, consumer-driven testing, and end-to-end integration drills.

---

## 3. Micro-Exercise: Resolving the Integration Bug
**Component Specs:**
- **Booking Service API (Stream A):**
  - Endpoint: `POST /api/bookings`
  - Response: `{ booking_id: uuid, status: "confirmed", created_at: "2025-03-15T14:30:00Z" }` (ISO 8601 UTC String).
- **Notification Service API (Stream B):**
  - Endpoint: `POST /api/notifications/booking-created`
  - Request: `{ booking_id: uuid, created_at: number, provider_id: uuid }` (Unix Timestamp Integer).

**Defect Analysis:**
- Both components passed unit tests within their respective repositories.
- At runtime, Stream B expects a numerical timestamp (`seconds since epoch`), but receives a string.
- *Failure Modes:* The notification service either throws an unhandled `TypeError` during numeric arithmetic (`created_at * 1000`), formats a `NaN-NaN-NaN` date string in provider notification emails, or silently drops the event.
- *Seam Fix:* Standardize on a shared `@skillswap/contracts` DTO package that enforces ISO 8601 UTC strings across all event consumers and producers.

---

## 4. Requirements Traceability: The Courtroom Chain of Custody
- Requirements traceability maps every requirement from its inception in Module 01 through decomposition, ticket specification, parallel execution, mid-build adaptation, and final verification.
- Just like legal evidence in court, if an item from our original 18-requirement matrix cannot be accounted for (shipped, adapted, or explicitly cut), it represents an unmanaged defect in decomposition.
- In Module 08, we will trace all Module 01 requirements to ensure complete accountability.
