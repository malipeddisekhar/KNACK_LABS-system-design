# Module 01: Pretest & Setup Check

## Part A: Quick Setup Check
- **Node Version:** `v26.13.0` (exceeds v18+ requirement)
- **Git Version:** `git version 2.52.0.windows.1`
- **Editor:** VS Code / Antigravity IDE
- **OS & Shell:** Windows 11 Pro, PowerShell 5.1
- **Tooling Status:** Ready. No missing tools or blocker errors.

## Part B: Starting Questions & Demonstrations

### 1. Self-Rating
**Choice:** `strong (I can decompose a spec, order by dependency, and adjust mid-build)`
**Reasoning:** Experienced in breaking complex distributed systems into decoupled, testable vertical slices, mapping execution DAGs, establishing interface contracts, and handling mid-sprint pivots.

### 2. First Action on Receiving a 3-Page Product Spec
Read the spec end-to-end to extract core business goals, identify scope boundaries (in-scope vs. non-goals), map system boundaries / interface contracts, and flag high-risk technical unknowns for early de-risking spikes before writing any production code.

### 3. Task Ordering (DAG Resolution)
- Given Tasks: A, B, C, D, E
- Dependencies: C depends on A; D depends on B and C; A, B, and E are independent root tasks.
- **Topological Build Order:** `A -> B -> C -> D -> E` (or `B -> A -> E -> C -> D`)
  - A and B can execute in parallel.
  - C executes after A.
  - D executes after both B and C complete.
  - E can execute at any time since it has no inward or outward dependencies.

### 4. Vertical Slice Definition & Value
A vertical slice delivers a narrow, fully functional path through every architectural layer—from user interface/API through domain logic down to database persistence—to de-risk integration early and validate the architectural contract before building out horizontal breadth.

### 5. Mid-Sprint Pivots on Core Assumption Change
Pause in-flight tasks touching the assumption immediately to assess the blast radius, isolate invalidated work from salvageable components, calculate the delta against sprint capacity, and explicitly negotiate scope trade-offs with stakeholders rather than silently absorbing scope creep.

### 6. Planning Philosophy
**Choice:** *"Plan enough to start, then adapt"*
**Reasoning:** Upfront planning should establish solid interface contracts, architectural boundaries, and critical path dependencies, while emergent implementation realities and feedback loops require tactical adaptation as details solidify.

### 7. Task Description Quality Criteria
A task description is "good enough" for another developer or AI agent when it specifies an unambiguous objective, explicit input/output contracts, exact file and scope boundaries, concrete acceptance criteria with deterministic verification commands, and explicit non-goals.

### 8. Discovering Hidden Shared Schema Dependencies Mid-Build
Halt concurrent writes to the shared table, formalize the schema migration contract and lock ordering between the two tasks, update the execution DAG so the schema change lands and is verified first, and then resume the dependent task against the updated contract.
