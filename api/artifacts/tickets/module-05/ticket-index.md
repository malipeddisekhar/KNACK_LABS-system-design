# Module 05: Task Specification — Ticket Index

This index catalogs the 5 prescriptive task specifications decomposing **Slice 1 (Browse & Book Seeded Providers)** and **Slice 2 (User Authentication & Dashboard)** for SkillSwap.

Every ticket adheres strictly to the 7-section standard:
1. **Title**
2. **Context (Why)**
3. **Scope (What)**
4. **Interface Contract (Inputs / Outputs / Data Shapes)**
5. **Acceptance Criteria (Given / When / Then Behavioral)**
6. **Constraints (Rules to follow)**
7. **Anti-Scope (Explicit boundaries)**

---

## Ticket Roster & AI-Readiness

| Ticket ID | Title | Slice | Target Complexity | AI-Ready Bar | Status |
|---|---|:---:|:---:|:---:|:---:|
| **[TICKET-01](file:///artifacts/tickets/module-05/TICKET-01-seed-providers.md)** | Seed Database with 3 Test Providers & Availability Slots | Slice 1 | S (1–2 hrs) | Standard | Ready for Build |
| **[TICKET-02](file:///artifacts/tickets/module-05/TICKET-02-get-providers.md)** | `GET /api/v1/providers` — List Active Providers with Slot Previews | Slice 1 | S (2 hrs) | **AI-Ready** | Ready for Build |
| **[TICKET-03](file:///artifacts/tickets/module-05/TICKET-03-post-bookings.md)** | `POST /api/v1/bookings` — Create Confirmed Booking with Slot Mutex | Slice 1 | M (2–3 hrs) | **AI-Ready** | Ready for Build |
| **[TICKET-04](file:///artifacts/tickets/module-05/TICKET-04-auth-register-login.md)** | `POST /api/v1/auth/register` & `login` — User Auth & JWT Cookies | Slice 2 | M (2–3 hrs) | **AI-Ready** | Ready for Build |
| **[TICKET-05](file:///artifacts/tickets/module-05/TICKET-05-get-user-bookings.md)** | `GET /api/v1/users/me/bookings` — User Booking History Dashboard | Slice 2 | S (1.5–2 hrs) | Standard | Ready for Build |

---

## AI-Ready Bar Criteria Checklist
Tickets flagged as **AI-Ready** (TICKET-02, TICKET-03, TICKET-04) satisfy the autonomous execution contract:
- **Zero Missing Context:** No reliance on unspoken conventions; exact file locations, ORM patterns, and HTTP status codes are declared.
- **Typed Interface Contracts:** Exact TypeScript interfaces, DTO fields, validation regexes, and database schemas provided.
- **Preconditioned Given/When/Then Criteria:** Maps 1-to-1 to automated unit/integration test cases.
- **Watertight Anti-Scope:** Prohibits hallucinatory side effects (e.g., payment charges, mock emails, or unneeded third-party libraries).
