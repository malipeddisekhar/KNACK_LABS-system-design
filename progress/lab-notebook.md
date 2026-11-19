# Module 10 — Final Demo

Date: 2026-11-18
Environment: local API and worker containers on `test-net`; PostgreSQL database `url_shortener_test`; Redis `test-redis:6379`.

## 1. Health and readiness

Learner-reported: `GET /health` returned HTTP 200 with `{"ok":true}`. `GET /ready` returned HTTP 200 with database and Redis `up`.

## 2. Protected link creation

Learner-reported unauthenticated `POST /links`: HTTP 401, `UNAUTHORIZED`, `Bearer token is required.` Authenticated creation returned HTTP 201 for link `2678a967-9ca1-42a1-a2fc-fd6c5b62baae`, code `Lx5aID7E`, destination `https://example.com/`.

## 3. Database isolation

Read-only `SELECT current_database()` run by the reviewer inside both API and direct-node worker containers returned `url_shortener_test`, exit code 0.

## 4. Public redirects and analytics

Learner-reported initial unauthenticated redirect: HTTP 302, `Location: https://example.com/`. After worker processing, the protected analytics endpoint returned HTTP 200 with `total_clicks: 2`. A later redirect during cache verification was also persisted by the worker; no later analytics aggregate read was taken.

## 5. Cache invalidation — reviewer verified

Development credentials were read from the local test configuration and never printed. Login returned HTTP 201. Owned-link preflight returned HTTP 200. Updating the long URL returned HTTP 200 with `https://example.org/`. The unauthenticated redirect, without following it, returned HTTP 302 with `Location: https://example.org/`.

## 6. Search and pagination — reviewer verified

Authenticated `GET /links/search?q=example&page=1&page_size=10` returned HTTP 200 with keys `items`, `page`, `page_size`, `total`; page 1, page size 10, total 0. Read-only SQL showed `https://example.org/` tokenizes as the full lexeme `example.org`, so the partial term `example` does not match under the selected PostgreSQL full-text search design. Searching `q=example.org` returned HTTP 200, page 1, page size 10, total 1, with the demo link. The Module 8 E2E suite covers pagination and 1–100 page-size boundaries; its saved output is included in the 69-test E2E run.

## 7. Graceful shutdown — reviewer verified

API: `docker stop --timeout 15 app-container` returned CLI exit 0; inspect state was `exited`, process exit code 0, OOM false. No shutdown-specific line appeared in the captured log filter.

Worker: direct-node container `url-shortener-worker` used `node dist/worker.js`; inspect state was `exited`, process exit code 0, OOM false. Captured logs include worker startup, persisted click event, `Received SIGTERM. Shutting down Analytics Worker gracefully...`, and `Analytics Worker shut down cleanly.`

The earlier `npm run worker` container exited 1 on SIGTERM; direct Node execution resolved that shutdown issue. No containers were removed. PostgreSQL and Redis remain running.

## 8. Test evidence

Existing `progress/evidence/module-10/fix/runtime-port-fix-verification.txt` records 7 unit suites / 34 tests passed and 9 E2E suites / 69 tests passed, with the test database guard. The suites were not rerun during this review.

## Module 10 REFLECT — Answers

### Deployment strategy and operational lesson

Chosen strategy: multi-service deployment with separate API, worker, Redis, and PostgreSQL services, plus a one-off migration job before application deployment. This supports independent scaling and rollback while requiring coordinated networking, environment configuration, and readiness checks.

Operational lesson: use the platform-provided `PORT`, bind to `0.0.0.0`, reproduce failures with controlled tests, inspect the actual container, and verify health, readiness, and graceful shutdown before calling a deployment reliable.

### Knowledge Check

1. **Core problem:** CI/CD automates testing, building, and deployment after code changes, catching problems early and reducing manual release errors.
2. **Most impactful decision:** Multi-service deployment separates API, PostgreSQL, Redis, and analytics worker. This improves independent scaling and reliability but adds networking, configuration, and health-check coordination.
3. **End-to-end evidence:** Health/readiness, authentication, link creation, redirects, analytics, cache invalidation, worker lifecycle, and saved test results (34/34 unit; 69/69 E2E). Detailed evidence is in `progress/evidence/module-10/reflect/final-demo-verification.txt` and `progress/evidence/module-10/fix/runtime-port-fix-verification.txt`.

Instructor review: Knowledge Check answers assessed 10/10 each; Ship Recap assessed 10/10. These are instructional assessments, not an official UPSK module score.

### Ship Recap

Shipped a containerized URL Shortener with separate API, PostgreSQL, Redis, and analytics worker services, plus authenticated link creation, public redirects, click analytics, updates, health/readiness checks, and automated tests. Remaining production risk: service failures or downtime; mitigate with health monitoring, automated restarts, logs, backups, and alerts.

