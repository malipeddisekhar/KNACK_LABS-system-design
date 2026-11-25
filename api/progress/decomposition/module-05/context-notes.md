# Module 05: Task Specification — Context Notes

## Micro-Exercise: Deconstructing the Vague Ticket (Version A)

### Version A Ticket:
> **Title:** Create booking endpoint  
> Build an API endpoint that lets users book a service provider. It should validate the input and return a confirmation. Handle errors appropriately.

---

### Questions an Engineer or AI Agent Must Ask Before Writing Code:
If an engineer or autonomous coding agent receives Version A, they cannot begin writing reliable software without answering at least 12 critical specification questions across 5 architectural categories:

#### 1. Transport & Routing Contract:
- **Q1: What is the exact URL path?** Is it `/api/v1/bookings`, `/api/bookings`, `/bookings`, or `/providers/:id/book`?
- **Q2: What HTTP verb is expected?** Is it `POST` (standard REST creation) or `PUT` / `PATCH`?
- **Q3: What content-type is expected?** Is it strictly `application/json`, or does it accept `multipart/form-data`?

#### 2. Ingress Payload & Validation Schema:
- **Q4: What are the exact field names, types, and constraints in the request body?**
  - Is provider ID passed as `provider_id`, `providerId`, or `expert_id`? What data type (UUID, integer ID, string slug)?
  - Is time slot specified by `slot_id` (UUID), or by raw `start_time` and `end_time` ISO strings?
  - How is caller identity supplied? Is `user_id` passed in the body, or extracted from an auth token?
  - Are there optional fields (e.g., `notes: string (max 500 chars)`)?
- **Q5: What are the exact validation failure rules?** If a field is missing, what HTTP status is returned (`400 Bad Request` vs `422 Unprocessable Entity`), and what is the exact JSON structure of the error payload?

#### 3. Domain Logic & Concurrency Invariants:
- **Q6: How does the system handle race conditions / double-booking?** What database locking mechanism is required (pessimistic `SELECT FOR UPDATE`, serializable transaction, or unique database index)?
- **Q7: What happens when the requested slot is already booked?** What status code is returned (`409 Conflict` vs `400 Bad Request`), and what is the error message key?
- **Q8: What happens if the provider or slot does not exist?** Does it return `404 Not Found` with `{ "error": "provider not found" }` or `{ "error": "slot not found" }`?

#### 4. Egress Response Contract:
- **Q9: What HTTP status code is returned on success?** Is it `201 Created` or `200 OK`?
- **Q10: What is the exact JSON payload returned to the caller?** Does it return the full booking entity, just `{ "booking_id": "..." }`, or nested provider details? Are timestamps ISO-8601 UTC?

#### 5. Scope & Boundary Enforcements (Anti-Scope):
- **Q11: Does this ticket require authentication?** Should it reject unauthenticated requests with `401 Unauthorized`, or is auth deferred to a separate ticket?
- **Q12: Does this endpoint trigger side effects?** Does it process Stripe payments? Does it trigger transactional emails? Does it dispatch push notifications? If not explicitly anti-scoped, an AI agent will hallucinate mock email sending or broken Stripe calls.

---

### Key Takeaway: The Spec is the Product
- Version A creates round-trip delays, hallucinated implementations, and broken frontend integrations.
- Version B completely eliminates ambiguity by defining the exact URL, payload contracts, status codes, acceptance criteria, constraints, and anti-scope.
- A high-clarity task specification allows any human engineer or AI coding agent to execute in one pass without asking clarifying questions.
