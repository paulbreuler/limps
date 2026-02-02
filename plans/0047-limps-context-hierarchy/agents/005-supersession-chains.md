---
title: Supersession Chains
status: GAP
persona: coder
depends_on: [000]
files:
  - src/context/supersession.ts
  - src/cli/commands/adr/supersede.ts
  - src/cli/commands/adr/history.ts
tags: [context, adr, supersession]
---

# Agent 005: Supersession Chains

## Objective

Track when documents supersede others, maintaining decision history chains.

## Tasks

1. **Supersession manager** (`src/context/supersession.ts`)
   - `supersede(oldId, newId)`: Create supersession link
   - Update both documents' frontmatter
   - Set old document status to 'superseded'
   - Build supersession graph

2. **Chain traversal**
   - `getSupersessionChain(docId)`: Walk back through history
   - `getCurrentVersion(docId)`: Follow chain to current
   - `getSupersededBy(docId)`: What replaced this?

3. **ADR commands**
   - `limps adr supersede ADR-0003 ADR-0010` — Create link
   - `limps adr history ADR-0010` — Show chain
   - `limps adr current ADR-0003` — Find current version

4. **Automatic updates**
   When ADR-0010 supersedes ADR-0003:
   - ADR-0010.supersedes = [ADR-0003]
   - ADR-0003.superseded_by = ADR-0010
   - ADR-0003.status = 'superseded'

## Frontmatter Schema

```yaml
---
title: "Use sqlite-vec"
type: adr
status: accepted  # proposed | accepted | deprecated | superseded
supersedes: [ADR-0003, ADR-0005]
superseded_by: null
---
```

## Acceptance Criteria

- [ ] `limps adr supersede` updates both documents
- [ ] `limps adr history` shows full chain
- [ ] Status automatically changes to 'superseded'
- [ ] Circular supersession detected and prevented
- [ ] Warns if anything references superseded ADR
