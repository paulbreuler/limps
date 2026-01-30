---
version: "1.0"
date: "2026-01-30"
status: "Draft"
type: "addendum"
extends: ""
author: ""
---

## Gotchas

- **Alias args ordering**: The `limps radix` alias must preserve legacy argument ordering so existing scripts and docs keep working.
- **limps radix flags**: Avoid breaking existing `limps radix` flags when adding or changing CLI options; preserve backward compatibility.