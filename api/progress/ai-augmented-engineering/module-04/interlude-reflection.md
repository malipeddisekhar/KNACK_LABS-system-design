# Module 04 — INTERLUDE Reflection

## What should never be pasted into an AI prompt?

I should not paste secrets or credentials such as passwords, API keys, access tokens, private keys, or live connection strings. I should also keep out personally identifiable information and private user or customer data, proprietary intellectual property that is not approved for the tool, and unredacted production configurations or logs that may expose any of those details. A useful debugging prompt needs enough context to explain the failure, not raw sensitive material.

## How can I use AI safely during an urgent bug fix?

The middle path is to agree on appropriate zero-retention and data-use terms for the tool, redact secrets and personal data before sharing, and provide sanitized logs, minimal code excerpts, and synthetic fixtures that preserve the relevant behavior. For an 11 PM incident, a prepared workflow helps: remove credentials and identifiers, replace real records with representative fixtures, share only the smallest relevant context, and verify any proposed change locally against the incident symptoms and tests. This keeps the assistance useful under pressure without turning urgency into a reason to expose data.
