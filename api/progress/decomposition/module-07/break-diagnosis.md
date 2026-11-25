# Module 07 Break: The Second Requirement Shock (Role-Based Access Control)

## The Second Shock Scenario
Within 2 minutes of sending our impact statement, the PM drops a second requirement from Meridian Corp's IT Director:
> *"Their IT director requires role-based access for the company accounts. Managers should be able to make bookings for any employee. Employees should only be able to view their own bookings, not make bookings for others. And department heads need to see all bookings in their department. Can you account for that?"*

---

## 1. What NEW Artifacts Are Affected?
1. **Auth / JWT & Authorization Guard Pipeline (Escalated to MAJOR):**
   - Previously marked MINOR. Now must carry `companyRole: 'EMPLOYEE' | 'MANAGER' | 'DEPT_HEAD'` and `department: string` inside `JwtPayload`.
   - Requires implementing a NestJS `RolesGuard` (`@Roles(...)`) and reflector decorator to block Employees from accessing the corporate booking delegation endpoint (`POST /bookings` with `bookedFor`).
2. **Booking Authorization & Query Scoping Filter (`GET /bookings` / `GET /users/me/bookings`):**
   - Previously a simple learner equality filter (`learnerId == currentUserId`).
   - Now requires role-conditioned query dispatch:
     - **Employee:** Filter by `learnerId == currentUserId` OR `bookedForEmail == currentUserEmail`.
     - **Manager:** Filter by `bookerId == currentUserId`.
     - **Department Head:** Filter by `department == currentUserDepartment`.
3. **Seed Data Fixtures (`TICKET-07` Escalated):**
   - Must seed 3 distinct corporate personas from Meridian Corp:
     - `manager@meridian.com` (`role: MANAGER, department: "Engineering"`)
     - `jane.employee@meridian.com` (`role: EMPLOYEE, department: "Engineering"`)
     - `dept.head@meridian.com` (`role: DEPT_HEAD, department: "Engineering"`)

---

## 2. What Artifacts Marked MINOR Now Escalate to MAJOR?
1. **User Data Model:**
   - *Previous Assessment:* MINOR (`company_name: string?`, `can_book_for_others: boolean`).
   - *Escalation:* **MAJOR**. The single boolean flag cannot model three discrete roles or department boundary isolation. We must introduce a `CompanyRole` enum (`EMPLOYEE`, `MANAGER`, `DEPT_HEAD`) and a `department` string attribute.
2. **Booking Data Model & Event Serialization:**
   - *Previous Assessment:* MINOR (simple `booked_for_name`, `booked_for_email` columns).
   - *Escalation:* **MAJOR**. Bookings must now record `department` at creation time (captured from the beneficiary or booker). Otherwise, if an employee transfers departments or if department heads query historical bookings, department-level reporting will either require expensive cross-table joins or yield incorrect audits.

---

## 3. Scope Adjustment: What Else Must Be Cut?
Adding 3-role RBAC and department-scoped query filtering adds **12-16 hours** of engineering and testing work. To protect the immovable 6-day investor demo milestone, we cannot simply "work faster." We must make deeper cuts:

### Newly Cut Items (Escalated from "SHOULD SHIP" to "CUT"):
1. **CUT-05: Provider Attendee Notification Email Service (Was SHOULD SHIP):**
   - *Cut Rationale:* Automated email delivery with delegation headers is removed. Demo will show onscreen confirmation and database logs instead.
2. **CUT-06: Provider Dashboard Calendar Grid View (Was SHOULD SHIP):**
   - *Cut Rationale:* Replaced with a simple tabular list view of confirmed bookings.
3. **CUT-07: Self-Service Role Management & Department Admin UI:**
   - *Cut Rationale:* Admins cannot dynamically create departments or reassign employee roles via the web UI. Roles and departments are seeded statically for Meridian Corp in the demo environment.

---

## 4. Revised PM Impact Statement
We revised the PM communication to directly address the second shock:

> *"The IT Director's requirement for 3 distinct corporate roles (Manager, Employee, Department Head) and department visibility breaks our simple boolean flag and adds ~14 hours of authorization and data modeling work. We can still hit the 6-day investor demo, but only by taking two decisive actions: (1) we implement a Typed Role Bridge (roles and departments on user accounts without building a complex multi-tenant admin portal), and (2) we cut all remaining secondary features—specifically email notifications, provider calendar views, and dynamic department management. If Meridian insists on a live admin console to assign roles themselves for the demo, the 6-day date is mathematically impossible and we must push the demo by one week. I need your sign-off on the static demo persona approach within the next hour so we can proceed."*

---

## 5. Strategic Evaluation: Is the Decision (Option A vs Option B) Still Valid?
- **Does Pure Option B Hold?** **NO.** A binary `can_book_for_others` flag completely collapses under 3 roles and department-scoped visibility.
- **Does Full Relational Option A Hold?** **NO.** Attempting to build a full relational RBAC system (`Organizations`, `Departments`, `Roles`, `Permissions`, `UserDepartments`, and an enterprise administration console) in 5 remaining days guarantees delivery failure and demo catastrophe.
- **The Senior Engineering Synthesis (Typed Role Bridge):**
  We choose a **Typed Role Bridge**:
  - We elevate the schema from a naive boolean to explicit enum types (`CompanyRole { EMPLOYEE, MANAGER, DEPT_HEAD }`) and a `department` string on `User` and `Booking`.
  - We enforce role boundaries via a clean NestJS `@Roles()` guard and role-scoped Prisma queries.
  - We avoid the relational explosion of join tables and admin consoles by seeding Meridian's hierarchy directly.
  - This preserves the 6-day investor demo, satisfies Meridian's technical requirements for role isolation, and provides a clean, well-typed migration seam for post-funding refactoring.
