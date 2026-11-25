# Module 02: CONTEXT — Dependency Mapping & DAG Fundamentals

## 1. Production Context: Why Order Matters
- Flat lists obscure dependencies, leading to two expensive failure modes:
  1. **Over-serialization:** Chaining independent work sequentially, tripling delivery timelines.
  2. **Premature Foundationless Building:** Building downstream consumers before upstream data models exist (e.g. building search autocomplete with filters and sorting before the listing database schema is defined), leading to total rework.
- **DAG (Directed Acyclic Graph):**
  - *Directed:* Arrows indicate strict one-way prerequisite ordering ($A \rightarrow B$).
  - *Acyclic:* No circular loops ($A \rightarrow B \rightarrow C \rightarrow A$ is impossible to start).
  - *Graph:* Explicit nodes and edges modeling parallel execution branches.

---

## 2. Micro-Exercise: Four-Task DAG Analysis

### ASCII Diagram
```
        ┌─────────────────────────┐
        │ Task A: Set up database │
        └────────────┬────────────┘
                     │
         ┌───────────┴───────────┐
         ▼                       ▼
┌──────────────────┐   ┌──────────────────────────┐
│ Task B: User API │   │ Task C: Provider Profile │
└────────┬─────────┘   └─────────────┬────────────┘
         │                           │
         └───────────┬───────────────┘
                     ▼
        ┌───────────────────────────┐
        │  Task D: Booking System   │
        └───────────────────────────┘
```

### Answers to Questions
1. **Which tasks can happen at the same time?**
   - **Task B** (User registration API) and **Task C** (Provider profile page) can execute fully in parallel once Task A completes. They share an upstream dependency (the database), but have zero dependencies on each other.
2. **What is the longest chain from start to finish?**
   - Both `A -> B -> D` and `A -> C -> D` are tied as the longest paths (depth of 3 sequential tasks). This chain defines the **Critical Path** of the project.
3. **If Task A takes twice as long as expected, which tasks are delayed?**
   - **Every single task (B, C, and D)** is delayed. Because Task A is the single root bottleneck on the critical path, any slippage on A cascades directly into all downstream parallel branches and final convergence at D.
