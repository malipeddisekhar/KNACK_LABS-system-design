# Production Environment Configuration

This document specifies all environment variables required by the URL Shortener application services in production and CI environments.

---

## 1. Environment Variable Service Matrix

| Variable Name | API Service | Background Worker | One-Off Migration Job | CI / Local Tests | Description / Constraints |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `DATABASE_URL` | **Required** | **Required** | **Required** | Ignored in tests | PostgreSQL connection string (`[REDACTED_CONNECTION_STRING]). Used by Prisma ORM and migration engine. |
| `REDIS_URL` | **Required** | **Required** | Not Needed | Optional/Ignored | Redis connection string (`[REDACTED_CONNECTION_STRING] or `[REDACTED_CONNECTION_STRING] for TLS). Used by CacheService and BullMQ queue (`analytics-queue`). |
| `PORT` | **Required** (defaults to 3000) | Not Needed | Not Needed | Not Needed | Port on which NestJS API listens (bound to `0.0.0.0`). Valid range: 1–65535. |
| `PUBLIC_BASE_URL` | **Required** | Not Needed | Not Needed | Not Needed | Public canonical URL (e.g. `https://short.example.com`). Used to format `short_url` in link creation/retrieval responses. |
| `JWT_SECRET` | **Required** | Not Needed | Not Needed | Used in tests | Symmetric secret used to sign/verify authentication JWTs. Must be $\ge$ 32 characters with diverse character set. |
| `RETENTION_DAYS` | Optional (default: 30) | Optional (default: 30) | Not Needed | Optional | Number of days to retain click event telemetry before purging via `purgeExpiredClicks`. |
| `TEST_DATABASE_URL` | **Forbidden in Prod** | **Forbidden in Prod** | **Forbidden in Prod** | **Required** in Tests | Dedicated test database connection string. Guarded strictly: tests fail immediately if target database is not `url_shortener_test`. |

---

## 2. Service Separation & Decoupling Details

### API Service (`npm run start:prod`)
- **Required Variables**: `DATABASE_URL`, `REDIS_URL`, `JWT_SECRET`, `PUBLIC_BASE_URL`, `PORT`.
- **Decoupling Guarantee**: The API acts exclusively as an HTTP server and queue producer. It never initializes background queue workers or consumer listeners.

### Background Worker (`npm run worker`)
- **Required Variables**: `DATABASE_URL`, `REDIS_URL`.
- **Optional Variables**: `RETENTION_DAYS`.
- **Decoupling Guarantee**: The background worker requires zero web/HTTP environment variables. It bootstraps `WorkerModule` without requiring `PORT`, `JWT_SECRET`, or `PUBLIC_BASE_URL`.

### One-Off Migration Job (`prisma migrate deploy`)
- **Required Variables**: `DATABASE_URL`.
- **Decoupling Guarantee**: Reads `DATABASE_URL` from the environment via `prisma7.config.ts`. Does not require Redis, JWT secrets, or ports.

---

## 3. Deprecated / Removed Variables

The following variables found in legacy configurations have been analyzed and confirmed completely unused:

1. `MONGODB_URI`:
   - **Status**: Obsolete / Removed.
   - **Rationale**: The application uses PostgreSQL as its primary transactional store managed via Prisma ORM 7. MongoDB is not referenced anywhere in application source or test suites.
2. `API_KEY_A` / `API_KEY_B`:
   - **Status**: Obsolete / Removed.
   - **Rationale**: Authentication was designed and implemented in Module 4 using JWT bearer tokens via `AuthModule` and `JwtService`. Static API keys are obsolete and unreferenced in route guards or controllers.

---

## 4. Security & Secret Handling Rules

1. **No Hardcoded Secrets**: Secrets (`JWT_SECRET`, database passwords, Redis authentication credentials) must never be committed to source control or embedded in Docker images.
2. **Docker Isolation**: `.dockerignore` excludes all `.env`, `.env.*`, and `*.local` files so that production images built from the repository remain strictly free of credentials.
3. **Runtime Injection**: Inject configuration dynamically at runtime via platform environment variables (e.g., Railway environment variables, Kubernetes secrets).
4. **Credential Masking**: Health and readiness endpoints (`/health`, `/ready`) strictly sanitize outputs and never return connection strings, credentials, or raw database driver errors.

