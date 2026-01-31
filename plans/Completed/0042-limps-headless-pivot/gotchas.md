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
- **Render prop false positives**: Avoid false positives from unrelated `render` prop usage (e.g., custom components with render props that aren't Base UI). Only count `render` as Base UI evidence when it's a JSX expression, not a simple string.
- **Radix provider deprecated**: Keep Radix provider marked `deprecated: true` for warning output in audit reports.
- **Mixed component double-counting**: Avoid double-counting mixed components as both radix + mixed in migration analysis. A mixed component counts once toward legacyRadixCount.
- **Report JSON backward compatibility**: Ensure old JSON keys in AuditReport.summary remain unchanged for consumers; new fields (backendCounts, legacyRadixCount, migrationReadiness) are optional.
