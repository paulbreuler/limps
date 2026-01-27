---
title: limps Obsidian Frontmatter
status: active
workType: feature
tags: [limps/plan, limps/worktype/feature]
created: 2026-01-26
updated: 2026-01-27
---

# limps Obsidian Frontmatter

## Overview

Add Obsidian-compatible frontmatter to ALL limps file types. This is a prerequisite for the Obsidian plugin (0028) - without proper frontmatter, graph view shows ugly filenames instead of titles.

## Research Summary

### Library Specifications

**gray-matter (^4.0.3)** - Used in `src/utils/frontmatter.ts`:
- Default YAML parsing with `---` delimiters
- Uses js-yaml internally (YAML 1.1 core schema)
- Returns `data`, `content`, and optional `excerpt`
- Graceful degradation on missing content/frontmatter

**yaml (^2.7.0)** - Used in `src/agent-parser.ts`:
- Supports both YAML 1.1 and YAML 1.2
- Passes all yaml-test-suite tests
- Preserves comments and blank lines
- Standard types: booleans, null, numbers, strings, arrays, objects

### Obsidian 2026 Best Practices

From Obsidian's property documentation:
- Use **plural forms**: `tags` (not `tag`), `aliases` (not `alias`)
- **Date format**: `YYYY-MM-DD` (ISO 8601)
- `cssclasses` for styling (array of CSS class names)
- **Reserved properties**: `tags`, `aliases`, `cssclasses`, `publish`, `created`, `modified`

---

## File Type Schemas

### 1. Agent Files (`*.agent.md`)

**Current fields (keep):**
```yaml
status: GAP | WIP | PASS | BLOCKED
persona: coder | reviewer | pm | customer
dependencies: ["000", "001"]
blocks: ["002"]
files: ["src/file.ts"]
```

**Add Obsidian fields:**
```yaml
title: "Agent title for graph view"
tags: [limps/agent, limps/status/gap]
aliases: ["#000", "Agent 0"]
created: 2026-01-26
updated: 2026-01-26
```

**Full schema:**
```yaml
---
title: "Implement scoring weights"
status: GAP
persona: coder
dependencies: ["000", "001"]
blocks: ["002"]
files: ["src/scoring.ts", "src/config.ts"]
tags: [limps/agent, limps/status/gap, limps/persona/coder]
aliases: ["#001", "Scoring Agent"]
created: 2026-01-26
updated: 2026-01-26
---
```

### 2. Plan Files (`*-plan.md` or `plan.md`)

**New schema:**
```yaml
---
title: "Plan name for Obsidian graph"
tags: [limps/plan]
aliases: []
created: 2026-01-26
updated: 2026-01-26
status: draft | active | complete | archived
workType: feature | bug | refactor | docs
---
```

### 3. README.md (Plan Index)

**New schema:**
```yaml
---
title: "0001-feature Index"
tags: [limps/index]
created: 2026-01-26
updated: 2026-01-26
---
```

### 4. interfaces.md

**New schema:**
```yaml
---
title: "0001-feature Interfaces"
tags: [limps/interfaces, limps/contract]
created: 2026-01-26
updated: 2026-01-26
---
```

### 5. gotchas.md

**New schema:**
```yaml
---
title: "0001-feature Gotchas"
tags: [limps/gotchas, limps/issues]
created: 2026-01-26
updated: 2026-01-26
---
```

---

## Tag Taxonomy

Hierarchical tags for filtering in Obsidian:

```
limps/
├── plan                    # Plan files
├── agent                   # Agent files
├── index                   # README index files
├── interfaces              # Interface contracts
├── gotchas                 # Known issues
├── contract                # API contracts
├── status/
│   ├── gap
│   ├── wip
│   ├── pass
│   └── blocked
├── persona/
│   ├── coder
│   ├── reviewer
│   ├── pm
│   └── customer
└── worktype/
    ├── feature
    ├── bug
    ├── refactor
    └── docs
```

---

## Implementation Steps

### Step 1: Update Agent Parser Schema

**File:** `src/agent-parser.ts`

```typescript
interface AgentFrontmatter {
  // Existing
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  persona: 'coder' | 'reviewer' | 'pm' | 'customer';
  dependencies?: string[];
  blocks?: string[];
  files?: string[];
  
  // New Obsidian fields
  title?: string;
  tags?: string[];
  aliases?: string[];
  created?: string;  // YYYY-MM-DD
  updated?: string;  // YYYY-MM-DD
}
```

### Step 2: Create Plan File Schema

**File:** `src/plan-parser.ts` (new)

```typescript
interface PlanFrontmatter {
  title: string;
  status: 'draft' | 'active' | 'complete' | 'archived';
  workType?: 'feature' | 'bug' | 'refactor' | 'docs';
  tags?: string[];
  aliases?: string[];
  created?: string;
  updated?: string;
}

export function parsePlanFrontmatter(content: string): PlanFrontmatter;
export function updatePlanFrontmatter(content: string, updates: Partial<PlanFrontmatter>): string;
```

### Step 3: Update create-plan Tool

**File:** `src/tools/create-plan.ts`

Add frontmatter to all generated files:

```typescript
// {plan-name}-plan.md
const planContent = `---
title: "${planName}"
status: draft
workType: ${workType}
tags: [limps/plan, limps/worktype/${workType}]
created: ${today}
updated: ${today}
---

# ${planName}
...`;

// README.md
const readmeContent = `---
title: "${planNumber}-${planName} Index"
tags: [limps/index]
created: ${today}
updated: ${today}
---
...`;

// interfaces.md
const interfacesContent = `---
title: "${planNumber}-${planName} Interfaces"
tags: [limps/interfaces, limps/contract]
created: ${today}
updated: ${today}
---
...`;

// gotchas.md
const gotchasContent = `---
title: "${planNumber}-${planName} Gotchas"
tags: [limps/gotchas, limps/issues]
created: ${today}
updated: ${today}
---
...`;
```

### Step 4: Create Migration Script

**File:** `scripts/migrate-frontmatter.ts`

```typescript
async function migrateFrontmatter(plansPath: string) {
  // Find all plan directories
  // For each: add frontmatter to plan file, README.md, interfaces.md, gotchas.md
  // For agents: add title, tags, aliases, created, updated
  // Preserve existing content
  // Log changes
}
```

### Step 5: Auto-Update `updated` Field

On any file modification through limps:
```typescript
function touchUpdatedField(content: string): string {
  return updateFrontmatter(content, {
    updated: new Date().toISOString().split('T')[0]
  });
}
```

### Step 6: Update Tests

- Add tests for new frontmatter parsing
- Update existing test fixtures with new fields
- Test migration script on sample plans

---

## Verification

1. **Run `npm run validate`** - all tests pass
2. **Create test plan via MCP** - verify frontmatter in all files
3. **Open in Obsidian** - verify:
   - Graph view shows descriptive node names
   - Properties panel displays frontmatter
   - Tags appear in tag pane
   - Aliases work for search
4. **Run migration on existing plans** - verify no data loss

---

## Backward Compatibility

- All new fields are **optional**
- Existing plans without frontmatter still parse
- Migration adds fields without removing existing data
- Default values used when fields missing

---

## Status

Status: Planning
Work Type: feature
Created: 2026-01-26
