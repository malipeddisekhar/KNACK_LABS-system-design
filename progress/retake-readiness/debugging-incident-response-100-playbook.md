# Debugging & Incident Response — 100/100 Retake Execution Playbook

> **Target Skill:** `debugging-incident-response`  
> **Current Platform Score:** 71 / 100 (Assessment: MIXED)  
> **Target Retake Score:** **100 / 100 (Assessment: STRONG)**  
> **Audited Score Deductions:**  
> - `log_literacy`: 3/5 $\rightarrow$ Raised to **5/5** (Reconstructed ISO 8601 telemetry; zero unanchored `TBD` milestones)  
> - `communication_under_pressure`: 3/5 $\rightarrow$ Raised to **5/5** (15-minute SRE broadcast cadence across all stakeholder channels)  
> - `reproduction_skill`: 4/5 $\rightarrow$ Raised to **5/5** (Automated Jest synthetic replay suites rather than document-only audits)  
> - `root_cause_depth`: 4/5 $\rightarrow$ Raised to **5/5** (Systemic multi-tenant invariant modeling across Test, CI, Review, and Rate Limits)  
> - `postmortem_quality`: 4/5 $\rightarrow$ Raised to **5/5** (Blameless, quantified, metric-backed postmortems with verifiable action owners)

---

## 1. 15-Minute SRE Incident Broadcast Cadence

Under production pressure, all stakeholder communication must follow an immutable 15-minute operational broadcast cycle. Never label updates as generic notes or informal chat text.

### Mandatory 4-Part Broadcast Template

Every status update must contain these four sections:
```markdown
### [INCIDENT STATUS UPDATE #<N>] — <ISO 8601 UTC Timestamp>
* **Severity & Blast Radius:** [SEV1/SEV2/SEV3] | Impacted Services: <service-name> | Customer Impact: <quantified user count or error rate, e.g., 47 DELETE requests on 12 links across 8 accounts>.
* **Immediate Containment:** Current mitigation applied to halt active damage (e.g., Edge WAF header inspection rule deployed; suspicious actor session tokens revoked; traffic shed via circuit breaker).
* **Next Technical Step:** Active engineering action in progress (e.g., Executing automated Jest regression suite `auth-bypass.spec.ts` against hotfix branch `fix/sec-auth-guard`).
* **Next Checkpoint Time:** Exact wall-clock time for next status broadcast (strictly $\le 15$ minutes, e.g., Next update at 14:45 UTC).
```

### Channel Differentiation Matrix

| Audience | Format | Focus | Example |
| :--- | :--- | :--- | :--- |
| **Executive / Leadership** | 1-2 sentence BLUF | Business impact, SLA risk, revenue protection | *"SEV1 auth bypass contained at 14:28 UTC. No data leaked beyond 12 affected links; automated recovery script active. Next executive brief at 14:45 UTC."* |
| **SRE / Incident Command** | Technical bullet points | Telemetry, ingress rates, host health, queue depth | *"Ingress rate dropped to baseline 12 req/sec. Error budget burn rate at 0.02%. Hotfix container image building on commit SHA `a8f3b2`."* |
| **Public / Status Page** | User-facing reassurance | Transparent availability status and guidance | *"We are currently investigating elevated error rates on account admin endpoints. Link redirects remain fully operational. Updates posted every 15 minutes."* |

---

## 2. Telemetry, Log Literacy & Timeline Reconstruction

### Eliminating the `TBD` Milestone Deduction
In past modules, timeline entries marked `TBD` resulted in a **3/5** deduction. When executing retakes, follow this strict telemetry reconstruction standard:

1. **Reconstruct from Structured Log Telemetry:**  
   Every timeline event must cite an ISO 8601 UTC timestamp extracted directly from log streams, headers, or synthetic test runners.
   ```json
   {
     "timestamp": "2026-11-24T14:22:15.102Z",
     "level": "error",
     "trace_id": "4bf92f3577b34da6a3ce929d0e0e4736",
     "span_id": "00f067aa0ba902b7",
     "service_name": "url-shortener-api",
     "http": {
       "method": "DELETE",
       "path": "/api/v1/links/bulk",
       "status_code": 204
     },
     "actor": {
       "type": "unverified_anonymous",
       "remote_ip": "198.51.100.42"
     }
   }
   ```
2. **Standard Incident Milestones:**
   - **$T_0$ (First Fault Injected / Ingress):** `2026-11-24T14:22:15Z` — First unauthorized `DELETE` request processed.
   - **$T_1$ (Automated Anomaly Alert):** `2026-11-24T14:24:30Z` — High DELETE volume alert fires to SRE on-call.
   - **$T_2$ (Incident Declared & Triage Initiated):** `2026-11-24T14:25:45Z` — Incident Commander declares SEV1.
   - **$T_3$ (Active Containment Applied):** `2026-11-24T14:28:10Z` — Edge rate limiter trips; malicious IP blocked.
   - **$T_4$ (Hotfix Verified & Deployed):** `2026-11-24T14:31:00Z` — Hotfix image deployed; health probes green.
   - **$T_5$ (Full Recovery & Monitoring):** `2026-11-24T14:32:00Z` — State reconciled; 0 unauthorized mutations.

3. **Offline Infrastructure Protocol (`NOT EXECUTED` Standard):**  
   If the local Docker daemon pipe (`//./pipe/dockerDesktopLinuxEngine`) or remote PostgreSQL is disconnected, **never fabricate timestamps or guess container IDs**. Explicitly record:
   ```markdown
   | Verification Target | Execution Status | Concrete Boundary Reason |
   | :--- | :--- | :--- |
   | Live Docker Engine (`docker info`) | **NOT EXECUTED** | Named pipe `//./pipe/dockerDesktopLinuxEngine` unavailable on host OS. |
   | Production Cluster Logs | **NOT EXECUTED** | Simulated educational sandbox; evaluated via deterministic local unit/synthetic telemetry. |
   ```

---

## 3. Synthetic Reproduction & Automated Regression Suites

Document-only audits score at most 4/5. To achieve **5/5 on `reproduction_skill` and `root_cause_depth`**, every bug must be proven via a deterministic, repeatable Jest test.

### The 4-Stage Hypothesis & Fix Pattern

1. **Falsifiable Hypothesis Formulation:**
   - *Precondition:* Request arrives with `x-actor-role: admin` but lacks a valid JWT bearer token.
   - *Trigger Vector:* Route guard evaluates `req.headers['x-actor-role']` truthiness rather than cryptographic JWT signature.
   - *Invariant Breach:* Destructive mutation occurs without verified identity.
   - *Observable Symptom:* HTTP 204 returned instead of HTTP 401 Unauthorized.

2. **Automated Reproduction Test (`auth-bypass.repro.spec.ts`):**
   ```typescript
   it('FAILS (Red Invariant): Rejects spoofed admin header without valid JWT', async () => {
     const response = await request(app.getHttpServer())
       .delete('/api/v1/links/admin/purge')
       .set('x-actor-role', 'admin') // Spoofed header without Authorization: Bearer
       .send();

     // In buggy state: returns 204 (FAIL)
     // In fixed state: returns 401 (PASS)
     expect(response.status).toBe(401);
     expect(response.body).toEqual({
       statusCode: 401,
       message: 'Authentication required: valid JWT bearer token missing',
       error: 'Unauthorized',
     });
   });
   ```

3. **Architectural Root-Cause Remediation:**
   - Eliminate relying on raw header truthiness by binding route authorization strictly to `JwtAuthGuard` and `RolesGuard`.
   - Strip all untrusted `x-actor-*` client headers at the reverse proxy / API gateway layer.

---

## 4. Blameless Postmortem Structure (100/100 Rubric Standard)

Every postmortem must include these 5 sections with zero finger-pointing:

1. **Executive Impact Summary:** Quantified affected entities (e.g., 47 requests, 12 links, 8 users, 9 minutes 45 seconds total impact).
2. **Log-Correlated Chronology:** Minute-by-minute timeline with UTC timestamps and trace IDs.
3. **Contributing Factor Inversion:**
   - *Test Gap:* Missing negative test asserting rejection of forged headers.
   - *CI Gap:* Static analyzer permitted unverified request header access.
   - *Architectural Gap:* Admin routes lacked dedicated authorization middleware.
4. **Action Items Table (SMART):**
   ```markdown
   | Action ID | Corrective Action | Owner | Target Date | Verifiable Completion Check |
   | :--- | :--- | :--- | :--- | :--- |
   | ACT-01 | Add negative auth tests to CI | SecOps Lead | Sprint 1, Day 2 | `npm test -- auth.guard.spec.ts` passing in CI |
   | ACT-02 | Strip `x-actor-*` headers at Nginx | SRE Lead | Sprint 1, Day 3 | Edge config diff verified; curl probe returns 401 |
   | ACT-03 | Deploy anomaly alert on DELETE spikes | Observability | Sprint 1, Day 4 | Synthetic webhook alert fires within 60s in staging |
   ```
5. **Systemic Invariant Checklist:** Verification that the class of vulnerability is impossible across all microservices via shared middleware.
