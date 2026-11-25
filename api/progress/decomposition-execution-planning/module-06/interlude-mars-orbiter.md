# Interlude 3: The Mars Climate Orbiter — When Teams Don't Share Contracts

## Context & Retrospective
On September 23, 1999, NASA's \$125 million Mars Climate Orbiter was lost when it entered Mars's upper atmosphere at 57 km instead of the planned 226 km trajectory. The root cause was neither a hardware defect nor a coding bug: Lockheed Martin's onboard software calculated thruster impulse in English units (pound-force seconds), while JPL's ground software expected metric units (newton-seconds). Because 1 lbf·s = 4.44822 N·s, every navigation calculation was off by a factor of 4.45 for nine months.

---

## Reflection Questions & Engineering Analysis

### 1. What kind of testing would have caught the units mismatch?
Both Lockheed and JPL had 100% passing unit tests and internal integration tests because every function satisfied internal expectations. The failure occurred in the seam between systems. The following testing disciplines would have exposed the defect:

1. **Consumer-Driven Contract Testing (e.g., Pact):**
   - In contract testing, the consumer (JPL's trajectory system) publishes an explicit contract defining exact expectations: field name `impulse`, unit of measurement `N·s`, and expected physical range.
   - Lockheed's build pipeline must verify against this consumer contract before any artifact is released. If Lockheed produces values scaled in lbf·s, the contract test fails immediately in CI.
2. **End-to-End Hardware-in-the-Loop Simulation with Invariant Assertions:**
   - Running simulated thruster firing commands through the entire round-trip pipeline (spacecraft flight software -> telemetry transmission -> ground station ingestion -> trajectory calculation) with physical invariant assertions.
   - An assertion checking delta-V against fuel burned ($\Delta v = I_{sp} g_0 \ln(m_0/m_f)$) would have detected a ~445% discrepancy on day one.
3. **Nominal / Semantic Type Systems (Preventing Naked Floats):**
   - Expressing measurements as rich domain types (`struct NewtonSeconds { double value; }`) rather than raw `double` or `float` primitives. In modern TypeScript/C++, type wrappers prevent assigning `PoundForceSeconds` to `NewtonSeconds` at compile time.
4. **Self-Describing Data Envelopes:**
   - Emitting metadata alongside scalar numbers:
     ```json
     {
       "force": {
         "value": 15.2,
         "unit": "newton_seconds"
       }
     }
     ```
   - An ingestion deserializer validates the unit string before passing the scalar to the physics engine.

---

### 2. What were our "units" in Module 06, and where could assumptions diverge?
In software engineering, "units" represent the unstated semantic conventions embedded in exchanged data. In our SkillSwap multi-agent parallel execution, the critical "units" were:

1. **Timestamp Serialization Formats:**
   - *The Mismatch:* Agent Beta emitted Unix epoch millisecond integers (`1716984600000`), whereas Agent Alpha and the public API contract expected ISO 8601 UTC strings (`"2026-05-29T12:10:00.000Z"`).
   - *The Danger:* Frontend date-formatting functions (`date.toISOString()`) crash when invoked on numbers, and string manipulators fail silently, rendering empty UI widgets.
2. **Enum Value Casing Conventions:**
   - *The Mismatch:* Agent Beta emitted database-style uppercase string literals (`status: "CONFIRMED"`), while Agent Alpha and the mobile client expected lowercase domain enums (`status: "confirmed"`).
   - *The Danger:* Strict equality checks (`booking.status === 'confirmed'`) evaluate to `false`, causing confirmed bookings to appear unconfirmed or stuck in limbo.
3. **Monetary Representation (Cents vs. Dollars):**
   - *The Mismatch:* Payment systems frequently represent amounts in minor currency units (integer cents, e.g. `5000` for \$50.00) to prevent floating-point rounding errors, while frontend booking DTOs may assume major decimal units (`50.00`).
   - *The Danger:* A 100x overcharge or undercharge if units are implicit rather than typed.
4. **ID Serialization & Null Handling:**
   - *The Mismatch:* UUID v4 strings vs integer autoincrement IDs, and omitting optional fields vs sending explicit `null`. In Prisma/PostgreSQL, `null` overwrites an existing database value, whereas `undefined` preserves it.

---

### Proactive Safeguards: How to Know Before It's Too Late
To prevent these quiet divergences before reaching production:
1. **Shared Single Source of Truth (`@skillswap/contracts`):**
   - Maintain a single shared package where TypeScript interfaces, Zod validation schemas, and class-transformer DTOs are compiled and distributed to all teams and AI agents.
2. **Automated Schema Linting at Checkpoint Gates:**
   - Enforce automated Checkpoint 1 validation that runs every agent's mock payload against the canonical schema.
3. **Fail-Fast Deserialization:**
   - Implement strict input filters that reject payloads containing unexpected casing, extra fields, or invalid timestamp formats with HTTP 422 Unprocessable Entity rather than coercing silently.
