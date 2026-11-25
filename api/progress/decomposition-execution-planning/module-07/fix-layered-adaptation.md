# Module 07 Fix: Layered Adaptation, Role Architecture, and Credible PM Alignment

## 1. Plan Layering vs. Starting from Scratch
Instead of panicking or discarding our completed work, we layered the second requirement shock directly onto the foundation established in Step 3:
- **Preserved Assets Retained:** `TICKET-01` (Seed Data), `TICKET-02` (Catalog & Slot API), and the atomic double-booking mutex transaction remain untouched.
- **Incremental Evolution:** We modified existing tickets (`TICKET-03`, `TICKET-04`, `TICKET-05`) and deepened our cuts rather than inventing a completely disjointed plan.

---

## 2. The Architectural Inflection Point: Abandoning the Boolean Flag
The arrival of Meridian's role-based requirements exposed the exact boundary where a naive hack breaks down:
- **Why Naive Option B Failed:** A simple `can_book_for_others: boolean` flag was adequate when the only question was "is this user an individual or a corporate booker?" However, when the requirement expanded to three distinct personas (**Manager**, **Employee**, **Department Head**) with differential visibility (Department Heads seeing all bookings in their department; Employees restricted to their own), a boolean is mathematically incapable of representing the state space.
- **Why Full Relational Option A is Lethal:** Attempting to build a normalized enterprise multi-tenant system (`Organizations`, `Departments`, `Roles`, `Permissions`, `UserOrganizations`, dynamic admin invitation workflows) requires 2-3 weeks of engineering, making the 6-day investor demo impossible.
- **The Senior Engineering Solution (Typed Role Model):**
  We implement a **Typed Role Model**:
  1. Add an explicit PostgreSQL enum:
     ```prisma
     enum CompanyRole {
       EMPLOYEE
       MANAGER
       DEPT_HEAD
     }
     ```
  2. Add `companyRole: CompanyRole?` and `department: String?` to the `User` and `Booking` models.
  3. This provides strict, type-safe authorization boundaries in NestJS without requiring 4 new relational tables or an administrative UI.

---

## 3. Runtime Mechanics: How Role-Based Access Works

### A. Data Model Storage
```prisma
model User {
  id           String       @id @default(uuid())
  email        String       @unique
  name         String
  role         UserRole     @default(LEARNER)
  companyName  String?
  companyRole  CompanyRole?
  department   String?
  bookings     Booking[]    @relation("BookingsAsLearner")
  managedBookings Booking[] @relation("BookingsAsBooker")
}

model Booking {
  id             String       @id @default(uuid())
  slotId         String       @unique
  learnerId      String
  bookerId       String?
  companyName    String?
  department     String?
  bookedForName  String?
  bookedForEmail String?
  status         String       @default("confirmed")
  totalPrice     Int
  currency       String       @default("USD")
  confirmedAt    DateTime     @default(now())
}
```

### B. Endpoint Authorization & Enforcement
1. **JWT Session Claims:** When logging in (`POST /auth/login`), the JWT payload contains:
   ```json
   {
     "sub": "usr_meridian_01",
     "email": "sarah.manager@meridian.com",
     "companyName": "Meridian Corp",
     "companyRole": "MANAGER",
     "department": "Engineering"
   }
   ```
2. **Guarding the Delegation Endpoint (`POST /bookings`):**
   - If `req.body.bookedFor` is present:
     - The controller checks `req.user.companyRole`.
     - If `req.user.companyRole !== CompanyRole.MANAGER`:
       - The request is immediately rejected with **HTTP 403 Forbidden**:
         ```json
         {
           "statusCode": 403,
           "error": "Forbidden",
           "message": "Only corporate managers are authorized to book on behalf of other employees."
         }
         ```
3. **Query Scoping on `GET /users/me/bookings`:**
   - The repository executes role-tailored query filters:
     - **Employee:** `WHERE learnerId = user.id OR bookedForEmail = user.email`
     - **Manager:** `WHERE bookerId = user.id`
     - **Department Head:** `WHERE companyName = user.companyName AND department = user.department`

---

## 4. The Three Versions of Our Plan (Living Documentation)
In this module, our execution plan evolved through three distinct iterations:
1. **Version 1 (Module 06 Baseline):** Three parallel streams (Catalog, Booking Mutex, Payment Escrow) focused purely on consumer bookings with individual checkout.
2. **Version 2 (Module 07 First Adaptation):** Layered Meridian corporate accounts via a minimal bridge (`can_book_for_others` boolean) and compressed scope to 6 days by cutting analytics, advanced search, and automated Stripe payouts.
3. **Version 3 (Module 07 Hardened Plan):** Replaced the boolean with the Typed Role Model (`CompanyRole` enum + `department` string), added `RolesGuard` and department-scoped query routing, and cut secondary features (provider email notifications, provider calendar view, self-serve admin UI) to preserve the immovable 6-day investor demo milestone.

---

## 5. Revised PM Communication
The revised impact statement in `artifacts/adaptation/module-07-adaptation-note.md` maintains complete credibility with the PM by acknowledging what changed, explaining why, and providing clear operational guidance.
