# Module 05: Task Specification — Verification & AI Agent Roleplay

## 1. Selected Ticket for Roleplay
**Ticket:** `TICKET-03: POST /api/v1/bookings — Create Confirmed Booking with Slot Mutex [AI-READY]`

---

## 2. The 3 AI Agent Questions & Classification

### Question 1: Prisma Schema Field & Model Casing
> *"The ticket says to update the database in an interactive transaction, but what are the exact Prisma model names and property casings? Is the model `Booking` or `bookings`? Is the foreign key `slot_id` or `slotId`? And is `status` a plain string or a Prisma enum?"*
- **Classification:** **Spec Gap**
- **Analysis:** In TypeScript and Prisma ORM, property casing (`camelCase` vs `snake_case`) is strict. If the Prisma schema uses `slotId` and the AI writes `tx.booking.create({ data: { slot_id } })`, TypeScript will fail compilation. An AI agent cannot infer Prisma schema definitions without inspecting the schema file.
- **Action Taken:** Updated TICKET-03 Section 4 with the exact Prisma schema snippet (`model Slot`, `model Booking`, `enum BookingStatus`, explicit camelCase property names).

---

### Question 2: Concurrency Implementation Pattern
> *"To prevent race conditions on slot booking, should I use `findUnique` followed by `update` inside an interactive transaction with serializable isolation, or should I execute an atomic conditional update `updateMany({ where: { id: slotId, isBooked: false }, data: { isBooked: true } })`?"*
- **Classification:** **Implementation Decision**
- **Analysis:** Both approaches are architecturally valid in PostgreSQL/Prisma. The behavioral requirement is explicitly specified: under concurrent attempts for the same `slotId`, exactly one must return `201 Created` and all subsequent calls must return `409 Conflict`. As long as the executor achieves this contract and passes the acceptance criteria, the specific query formulation is a legitimate implementation decision.
- **Action Taken:** Left open to executor implementation; confirmed acceptance criteria enforce the concurrency invariant.

---

### Question 3: Error Response Schema Consistency
> *"For input validation failures (e.g. missing `slotId`), does the application expect NestJS default `ValidationPipe` format (`{ statusCode: 400, message: string[], error: 'Bad Request' }`) or a customized format (`{ error: string }`)?"*
- **Classification:** **Spec Gap**
- **Analysis:** Frontend client integration depends on a consistent error format. If an AI agent implements a custom exception filter returning `{ error: "Invalid slotId" }` when the rest of the application expects NestJS's standard `{ statusCode: 400, message: [...] }`, frontend validation banners fail to display error messages.
- **Action Taken:** Updated TICKET-03 Section 4 with the exact NestJS error JSON schema for 400, 404, and 409 responses.

---

## 3. Red Flags Audit Across All 5 Tickets

| Red Flag Check | Audit Finding | Resolution / Verification |
|---|---|:---:|
| **Vague Words ("appropriate", "properly")** | Scanned all tickets; zero occurrences of "handle appropriately" or "properly". | **CLEAN** |
| **"The Database" without Context** | All tickets explicitly name PostgreSQL / Prisma ORM and import path (`PrismaService` from `src/prisma/prisma.service.ts`). | **CLEAN** |
| **Missing HTTP Status Codes** | Every endpoint lists every possible status code: 200, 201, 400, 401, 404, 409. | **CLEAN** |
| **Request/Response in Prose instead of JSON** | Every endpoint includes copy-pasteable JSON schemas and TypeScript DTO signatures. | **CLEAN** |
| **Uncontracted Cross-Ticket Output References** | TICKET-05 explicitly consumes the output of TICKET-03 and TICKET-04 using the exact schemas defined in those tickets. | **CLEAN** |
