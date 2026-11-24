# Module 1 Reflection — AI-Augmented Engineering Mindset

## Reflection

### Delegation strategy

Task-by-Task still feels like the right choice for the Team Collaboration feature in an unfamiliar codebase with strict role, invitation-replay, event-ordering, and audit requirements. Reviewing a small output before depending on it makes a mistaken assumption visible early; the trade-off is that I need to pause and verify at each handoff instead of chaining prompts. The BREAK exercise showed that this discipline can catch an overconfident false claim after one task rather than letting it shape later work.

### What the agent got right

The agent's structural claims were useful when independently checkable. Names-only listings confirmed the `src/`, `prisma/`, and `test/` layout and showed feature directories and files such as controllers, services, guards, migrations, and tests. Package metadata and a direct Jest run also provided concrete evidence about listed dependencies and the available test suite.

### What the agent got wrong

The intentional BREAK card claimed that the starter was only a platform folder and had no application files to test. Root and recursive filename listings showed real application, Prisma, and test files, and the direct Jest run passed 7 of 7 suites and 34 of 34 tests, so that claim was false. The evidence cannot identify the agent's internal cause: insufficient context or an unverified assumption is plausible, and hallucination is possible, but we cannot distinguish among them. This is separate from the earlier architecture summary, which did not make that claim and explicitly marked route behavior, schema details, and authentication logic unverified.

### Trust model

I can trust factual claims when I check them directly, such as whether a file exists, a dependency is listed, or a test command passes. I should verify interpretive and behavior claims—such as which routes a guard protects, how authentication handles invalid tokens, what schema relationships exist, and how a design works at runtime—using appropriate source inspection or focused tests when permitted. I should also challenge confident textbook-sounding answers and keep conclusions within the evidence actually observed.

### One surprise

The surprising part was that an answer could sound equally confident when it was right and when it was plainly contradicted by workspace evidence. AI was useful for organizing the investigation, but confidence in the wording was not a measure of correctness; a quick independent check made the difference.

### Looking ahead

For Module 2, I will keep the Task-by-Task approach: provide the relevant context, constraints, interfaces, and acceptance criteria; request one small, reviewable output at a time; and verify each result before allowing dependent work to proceed. I will distinguish observed facts from assumptions in the prompt and require concrete evidence for security-sensitive behavior, ordering, and audit requirements.

### Decision callback

I chose Task-by-Task because the feature spans several related concerns and an early wrong assumption could spread across dependent work. The false “no application files” claim is exactly the kind of error a checkpoint can catch early, provided I stop to compare the answer with independent evidence.

## Knowledge Checks

### 1. What core problem does this module solve in the AI engineering mindset?

It addresses the risk of delegating work to an AI without first understanding the codebase or checking its claims. Building a basic, evidence-backed mental model and calibrating trust lets an engineer use AI productively without treating plausible output as verified truth.

### 2. Which decision in this module had the biggest impact, and why?

Choosing Task-by-Task had the biggest impact because it created review points before assumptions could compound across the feature. The wrong-claim exercise showed the value of checking a small result against directory listings and tests before relying on it.

### 3. What evidence proves the implementation works end-to-end?

This module's deliverable was a verified understanding of the starter workspace, not a new feature implementation. The root and names-only listings established that application, Prisma, and test artifacts exist; package metadata identified the test runner; and the direct Jest run completed with 7/7 suites and 34/34 tests passing. Those checks establish that this workspace has a runnable test suite, but they do not prove specific route, authentication, schema, or production behavior.

## STEP 4 Mini-Practical — Reproducible Verification Proof

The direct test-suite check was recorded during STEP 4 as the strongest available sanity check. It used this command:

```powershell
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --runInBand
```

Recorded output summary:

```text
Test Suites: 7 passed, 7 total
Tests:       34 passed, 34 total
Snapshots:   0 total
Time:        9.553 s
Ran all test suites.
Exit code: 0
```

**Risk:** File listings and a passing test run could be overinterpreted as proof that specific routes, auth rules, or schema behavior are correct. **Mitigation:** Keep source-dependent claims labeled unverified until inspected or tested directly, and use focused behavior tests before relying on them.
