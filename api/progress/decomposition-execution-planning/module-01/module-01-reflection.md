# Module 01: REFLECT — Requirements Extraction, Contradiction Resolution & Synthesis

## 1. Requirements Inventory & Ratio Analysis
- **Total Requirements Extracted:** 24 requirements.
- **Explicit Requirements (15):** Direct capabilities stated in the prompt text (browsing by category, viewing profiles with ratings, booking slots, paying through platform, confirmation email, cancellation, instant search, setting availability/pricing/descriptions, earnings dashboard, flagging no-shows, 15% commission, vetting process, few thousand users scale, 5 cities expansion, admin dispute resolution, telemetry/analytics).
- **Implicit Requirements (9):** Unstated architectural, financial, and operational invariants derived through the silence pass (distributed slot locking to prevent double-booking, RBAC auth/token validation, platform escrow hold/reconciliation, structured cancellation policy engine, asynchronous email retry queue, financial audit ledger, timezone scoping, gateway refund fee economics, city-partitioned cache invalidation).
- **Ratio Assessment:** 15 explicit : 9 implicit (~62% : 38%). This represents a mature engineering reading depth—avoiding literal transcription while grounding all inferences in concrete domain requirements.

---

## 2. Decision Callback: Option B (Categorized Matrix)
In the DECIDE step, we chose **Option B: Categorized Matrix** over Option A (Flat List).
- **Pedagogical Connection:** Organizing requirements into a matrix by Stakeholder (Learner, Provider, Platform/Ops) and Type (Functional, Constraint, Quality Attribute) immediately forced categorization questions on items like the 15% commission (is it a provider constraint or a platform functional capability?).
- When the cancellation contradiction surfaced in the BREAK step, the categorized matrix immediately highlighted that the user-facing cancellation rule (Paragraph 1) and provider-facing policy autonomy (Paragraph 2) were modifying the same underlying domain entity without an integrated interface contract. A flat list would have obscured this cross-paragraph conflict.

---

## 3. Contradiction Resolution: Moving from Flagging to Solving
- Rather than leaving REQ-06 and REQ-22 as "needs clarification," we formulated two concrete, implementable options for Product Management:
  1. **Option 1 (Recommended Hybrid):** Standardized 1-hour cooling-off window for learners, combined with three discrete provider cancellation tiers (Flexible, Moderate, Strict) and guaranteed 85% net provider earnings on late cancellations.
  2. **Option 2 (Universal Platform Rule):** Binary appointment-lead-time policy (> 24 hours = 100% refund; < 24 hours = 0% refund) anchored strictly to session start time rather than booking creation time.
- Traced the blast radius across payment webhooks, escrow state, provider earnings dashboards, and financial ledgers.

---

## 4. Comprehension Questions & Knowledge Check

### 1. What core problem does this module solve in reading requirements?
It prevents building the wrong system. By reading with three distinct lenses (verbs for functional scope, qualifiers for constraints/quality attributes, and silences for omitted architectural foundations), engineers discover unstated assumptions, ambiguities, and contradictions before a single line of code is committed.

### 2. Which decision in this module has the biggest impact, and why?
The choice of requirements taxonomy (Categorized Matrix). Structuring requirements across stakeholders and types provides immediate visual gap detection, prevents stakeholder blind spots, and maps directly to service domain boundaries for vertical slicing.

### 3. What evidence proves the implementation works end-to-end?
- Starter quick-pass artifact in [module-01-quick-pass.md](file:///d:/KNACK%20SEKHAR%20LAB/upsk-system-design-workspace/api/artifacts/requirements/module-01-quick-pass.md).
- Full 24-requirement categorized matrix in [requirements-matrix.md](file:///d:/KNACK%20SEKHAR%20LAB/upsk-system-design-workspace/api/artifacts/requirements/requirements-matrix.md).
- Probing analysis quantifying search latency SLA (<100ms) and tracing refund money flows in [verify-requirements.md](file:///d:/KNACK%20SEKHAR%20LAB/upsk-system-design-workspace/api/progress/decomposition/module-01/verify-requirements.md).
- Contradiction diagnosis and PM resolution proposals in [break-diagnosis.md](file:///d:/KNACK%20SEKHAR%20LAB/upsk-system-design-workspace/api/progress/decomposition/module-01/break-diagnosis.md) and [fix-cancellation-resolution.md](file:///d:/KNACK%20SEKHAR%20LAB/upsk-system-design-workspace/api/progress/decomposition/module-01/fix-cancellation-resolution.md).

---

## 5. Mini Practical Task & Verification Proof
- **Verification Action:** Verified file existence and exact requirement line counts of generated artifacts.
- **Proof:**
  - Artifact 1: `artifacts/requirements/module-01-quick-pass.md` (5 explicit, 2 ambiguities, 1 PM question).
  - Artifact 2: `artifacts/requirements/requirements-matrix.md` (24 requirements across 3 stakeholder groups and 3 requirement types).
- **Named Risk:** Over-specifying unvalidated assumptions before PM alignment.
- **Mitigation:** Explicitly tagged low-confidence requirements as `BLOCKED - pending PM decision` and provided buildable options with explicit trade-offs.
