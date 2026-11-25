# Module 07 PM Impact Statement: Revised Scope & Role-Based Access Adaptation

## Communication to Product Manager

**Subject:** REVISED: Adapted Plan Incorporating Meridian Corp Role-Based Access (6-Day Delivery)

In my earlier message, I committed that we could deliver basic corporate booking alongside individual bookings for the investor demo. Following Meridian's IT Director requirement for role-based access (Manager booking, Employee self-view, and Department Head oversight), the scope has expanded by ~14 engineering hours, requiring us to adjust our delivery boundaries:

1. **What You Are Getting in 6 Days:** The demo will show all three requested Meridian personas in action: a Manager (`manager@meridian.com`) booking an expert session for an Employee (`employee@meridian.com`), the Employee logging in to see her confirmed booking with delegation blocked, and a Department Head (`depthead@meridian.com`) viewing all Engineering bookings across the department.
2. **What We Are Cutting to Absorb This:** To deliver these three roles without slipping the 6-day investor deadline, we have cut all remaining secondary features—specifically automated attendee email notifications, the provider calendar grid view, and any self-service admin UI for creating departments.
3. **What Is at Risk:** If Meridian requires a dynamic web console to invite users and assign roles on the fly during the demo, that cannot be built in 6 days and will force a one-week delay; our plan relies on pre-seeding Meridian's test department and users.
4. **What I Need From You:** I need your confirmation that pre-seeded demo accounts meet Meridian's pilot expectations so we can freeze the authorization architecture and begin implementation immediately.
