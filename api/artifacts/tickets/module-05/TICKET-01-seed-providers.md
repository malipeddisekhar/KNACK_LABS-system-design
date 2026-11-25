# TICKET-01: Seed Database with 3 Test Providers & Availability Slots

## 1. Title
`TICKET-01: Seed Database with 3 Test Providers & Availability Slots`

## 2. Context (Why)
To validate the initial booking loop without waiting for complex provider onboarding UI, we require realistic, deterministic seed data. This fixture populates 3 distinct expert providers and upcoming open time slots directly in the database, unblocking catalog viewing and booking creation in Slice 1.

## 3. Scope (What)
- Author a dedicated database seed script (`prisma/seed.ts` or SQL migration fixture).
- Insert exactly 3 provider records with realistic profiles:
  1. **Alice Walker:** Category `MATH_TUTORING`, Rate `$40/hr`, Headline `Calculus & Linear Algebra Specialist`, Rating `5.0`.
  2. **Bob Martinez:** Category `MUSIC`, Rate `$35/hr`, Headline `Acoustic & Classical Guitar Coach`, Rating `4.9`.
  3. **Charlie Chen:** Category `PROGRAMMING`, Rate `$50/hr`, Headline `Full-Stack TypeScript & NestJS Mentor`, Rating `4.8`.
- For each provider, seed exactly 3 available upcoming 60-minute time slots scheduled for tomorrow and the day after tomorrow.
- Ensure the seed script is idempotent (can be executed multiple times without inserting duplicate records).

## 4. Interface Contract
### Seed Data Schema (Prisma/Postgres):
```typescript
interface ProviderSeedData {
  id: string; // UUID v4
  fullName: string;
  category: "MATH_TUTORING" | "MUSIC" | "PROGRAMMING";
  headline: string;
  bio: string;
  hourlyRateCents: number;
  averageRating: number;
  isActive: boolean;
}

interface SlotSeedData {
  id: string; // UUID v4
  providerId: string; // FK to Provider
  startTime: Date; // ISO UTC
  endTime: Date;   // ISO UTC (startTime + 60 mins)
  isBooked: boolean; // default false
}
```

## 5. Acceptance Criteria (Given / When / Then)
- **Scenario 1: Initial Seed Run**
  - **Given** an empty or existing development database,
  - **When** the developer runs `npx prisma db seed` (or `npm run seed`),
  - **Then** exactly 3 provider rows exist in the `providers` table and exactly 9 slot rows exist in the `slots` table with `is_booked = false`.
- **Scenario 2: Idempotent Execution**
  - **Given** a database that has already been seeded,
  - **When** `npm run seed` is executed a second time,
  - **Then** the script completes with exit code 0 and total provider count remains exactly 3.

## 6. Constraints
- Use the existing database client and configuration.
- Time slot timestamps must be computed relative to execution time (`now() + 24h`, `now() + 28h`, `now() + 48h`) to prevent slots from appearing in the past.
- Generate valid UUID v4 primary keys.

## 7. Anti-Scope
- No provider password generation or authentication credentials (providers are static display entities in Slice 1).
- No frontend UI or API endpoints (handled in TICKET-02).
- No background check or verification flags.
