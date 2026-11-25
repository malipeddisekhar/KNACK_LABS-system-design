# Module 05: Task Specification — Break Diagnosis (The Technically Correct Disaster)

## Executive Summary
An autonomous AI agent executed the booking endpoint specification and passed every explicit acceptance criterion. However, the resulting code exhibited four severe production vulnerabilities:
1. **Unauthenticated Public Access:** Anyone could create bookings for arbitrary users.
2. **Missing Rate Limiting:** Susceptible to denial-of-service and bot spam.
3. **Stack Trace Leakage on 500 Errors:** Internal database errors bubbled up unhandled to clients.
4. **Zero Audit Logging:** No observability into transactional operations.

In each case, the AI agent did not fail execution—**the specification failed by omitting critical system boundaries and cross-cutting standards.**

---

## Detailed Diagnosis of the 4 Failure Modes

### 1. No Authentication / Insecure Caller Identity
- **1. What was missing from the ticket:**
  The ticket accepted `userId` directly in the HTTP JSON payload without specifying whether caller identity must be verified via an authenticated session (`req.user.id`) or if this was an anonymous MVP endpoint.
- **2. Ticket-Specific vs. Project-Wide Standard:**
  **Ticket-Specific Specification with Cross-Cutting Dependency.** Authentication infrastructure (JWT, cookies, OAuth) is project-wide, but the *security posture of a specific endpoint* (e.g., `Public` vs. `Protected` vs. `Role-Restricted`) is strictly ticket-specific. If an endpoint intentionally defers auth for an MVP slice, the ticket must explicitly declare that tradeoff so the executor does not invent insecure patterns.
- **3. Scope Impact:**
  - For Slice 1 (Anonymous MVP): Zero scope change, but requires an explicit notice: `Security: Public endpoint for Slice 1; caller userId is passed in body for demonstration purposes`.
  - For Slice 2 (Authenticated): Minimal addition (1 decorator: `@UseGuards(JwtAuthGuard)` and reading `@CurrentUser() user: UserEntity`).

---

### 2. Missing Rate Limiting / Abuse Protection
- **1. What was missing from the ticket:**
  The ticket contained zero throughput bounds, rate limits, or abuse mitigation rules.
- **2. Ticket-Specific vs. Project-Wide Standard:**
  **Project-Wide Standard with Ticket-Level Policy Tag.** Rate limiting infrastructure (e.g., NestJS `@nestjs/throttler` backed by Redis) belongs in the global application framework, not re-invented inside individual tickets. However, silence in the ticket is dangerous. The ticket's Constraints section must explicitly declare: `Rate Limiting: Bound by global ThrottlerGuard; apply @Throttle({ default: { limit: 10, ttl: 60000 } }) for booking creation`.
- **3. Scope Impact:**
  Trivial (1 annotation) if the global throttler is configured; catastrophic (days of out-of-scope work) if an executor attempts to build a custom in-memory rate limiter inside the controller.

---

### 3. Stack Trace Leakage on Unhandled 500 Errors
- **1. What was missing from the ticket:**
  The ticket explicitly enumerated 400, 404, and 409 responses, but was silent on unexpected database crashes, connection timeouts, or pool exhaustion. The agent defaulted to standard Express/Node crash bubbling.
- **2. Ticket-Specific vs. Project-Wide Standard:**
  **Strictly Project-Wide Standard (Global Exception Filter).** Production-grade 500 sanitization (redacting error messages, logging stack traces server-side, returning `{ statusCode: 500, message: "Internal server error", timestamp }`) MUST be handled by a global `AllExceptionsFilter`. Individual endpoint tickets should never define custom `try/catch` blocks for 500 errors.
- **3. Scope Impact:**
  Zero scope addition to the ticket. The ticket must explicitly state: `Unhandled exceptions must be caught by global AllExceptionsFilter; do not catch generic Errors in controller`.

---

### 4. Zero Transactional Audit Logging
- **1. What was missing from the ticket:**
  The ticket lacked any acceptance criteria or constraints mandating structured log output during transactional events.
- **2. Ticket-Specific vs. Project-Wide Standard:**
  **Hybrid: Project-Wide Logger Harness + Ticket-Specific Domain Assertion.** The logger instance (`AppLogger` / Winston) is shared infrastructure. However, the business mandate to emit an audit record upon booking confirmation must be explicitly asserted in the ticket's acceptance criteria: `Then an audit log event is recorded with event: "booking.confirmed", bookingId, providerId, and userId`.
- **3. Scope Impact:**
  Very small (1 line of code in `bookings.service.ts`: `this.logger.log({ event: 'booking.confirmed', bookingId, providerId, userId })`).

---

## Architectural Rule: "Silence Is Not a Reference"
The central takeaway from this disaster is that **unspoken assumptions create production incidents**. 
To prevent technically correct disasters, every prescriptive ticket must include an explicit **Standards Reference Block**:
```markdown
### Cross-Cutting Standards Compliance:
- **Authentication:** Public in Slice 1 (explicitly documented); Protected via JwtAuthGuard in Slice 2.
- **Rate Limiting:** Global ThrottlerGuard (Tier: Sensitive Write, 10 req/min per IP).
- **Error Handling:** Global AllExceptionsFilter (redacted 500s in production).
- **Logging:** Emit structured INFO log on successful booking using project AppLogger.
```
