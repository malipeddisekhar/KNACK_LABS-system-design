# Module 02: FIX — Breaking the Circular Dependency via Node Splitting

## 1. The Circular Dependency Diagnosed
In marketplace planning, circular dependencies frequently appear when administrative tools and onboarding flows are lumped together into monolithic blocks:

```
┌─────────────────────────┐
│   Provider Vetting      │ ◄──────────┐
└────────────┬────────────┘            │
             │ (Needs data model)      │ (Needs admin approval)
             ▼                         │
┌─────────────────────────┐            │
│   Provider Data Model   │            │
└────────────┬────────────┘            │
             │ (Needs approved data)   │
             ▼                         │
┌─────────────────────────┐            │
│  Full Admin Dashboard   │ ───────────┘
└─────────────────────────┘
```

- **Deadlock Condition:**
  - Vetting cannot occur without an Admin Dashboard to review applications.
  - The Admin Dashboard cannot be populated without Provider Data.
  - Valid Provider Data cannot exist without completed Provider Vetting.
  - Execution deadlocks because each task waits for the other to be fully built.

---

## 2. The Architectural Remedy: Node Splitting (Minimal vs. Full)
Circular dependencies are almost never resolved by adding more edges; they are resolved by decomposing an overloaded node into a **Minimal Core (Prerequisite)** and a **Full Feature (Consumer)**:

1. **WI-03a: Admin Review Tool (Minimal Core / CLI Endpoint):**
   - *Scope:* A lightweight programmatic review tool (e.g. `PATCH /admin/providers/:id/status?action=approve|reject`) or CLI admin script.
   - *Prerequisites:* Only needs `WI-02 (Listings Model)` with `status = 'pending'`.
   - *Blocks:* Unblocks `WI-03b (Provider Onboarding & Vetting)`.
2. **WI-11: Admin Operations & Dashboard (Full Platform UI):**
   - *Scope:* Full administrative console featuring real-time analytics, dispute arbitration, multi-city metrics, and provider performance leaderboards.
   - *Position:* Moved off the critical path into a parallel leaf consumer.

---

## 3. The Unlocked, Acyclic Execution Flow

```
1. WI-02 (Listings Model): Define provider schema with status: 'pending' | 'approved' | 'rejected'
             │
             ▼
2. WI-03a (Admin Review Tool - Minimal): Lightweight approve/reject endpoint
             │
             ▼
3. WI-03b (Provider Onboarding & Vetting): Providers submit KYC/profiles; approved via minimal tool
             │
             ├──────────────────────────────────────────┐
             ▼                                          ▼
4. WI-04 (Availability Engine)            5. WI-11 (Full Admin Dashboard)
   (Active vetted provider slots)            (Consumes approved providers & disputes)
```

- **Cycle Status:** 100% Broken. The graph is strictly acyclic ($A \rightarrow B \rightarrow C \rightarrow D$).
- **Critical Path Impact:** The critical path is compressed because building the minimal review endpoint takes 0.5 days, compared to 4 days for the full admin dashboard. The full dashboard is completely removed from the critical path.
