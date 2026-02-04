---
title: limps Self-Updating Intelligence
status: active
workType: feature
tags: [limps/plan, limps/worktype/feature]
created: 2026-01-26
updated: 2026-02-01
---

# limps Self-Updating Intelligence

## Overview

Plans get stale. Code diverges from specs. Status fields lie. This feature adds proactive intelligence to detect drift and suggest updates - like Mintlify's self-updating docs, but for planning documents.

## Problem Statement

Common failure modes:
1. **Stale plans** - Plan written 3 months ago, never updated, now irrelevant
2. **Status lies** - Agent marked WIP for 2 weeks, actually abandoned
3. **Code drift** - `files:` lists `auth.ts` but that file was renamed/deleted
4. **Orphaned agents** - Agent completed but plan file doesn't reflect it
5. **Zombie dependencies** - Depends on agent that's been BLOCKED forever

---

## Feature Set

### 1. Staleness Detection

Track activity and flag stale content:

```typescript
interface StalenessConfig {
  warningDays: number;      // Days until warning (default: 14)
  criticalDays: number;     // Days until critical (default: 30)
  excludeStatuses: string[]; // Don't flag PASS/archived
}

interface StalenessReport {
  stale: Array<{
    path: string;
    lastModified: Date;
    daysSinceUpdate: number;
    severity: 'warning' | 'critical';
    status: string;
  }>;
}
```

**Detection logic:**
- WIP agents not touched in 7+ days → warning
- GAP agents not touched in 14+ days → warning  
- Plans with no agent activity in 30+ days → critical
- PASS agents → never flag

### 2. Code-to-Plan Drift Detection

Compare `files:` field against actual codebase:

```typescript
interface DriftReport {
  missingFiles: Array<{
    agentPath: string;
    listedFile: string;
    reason: 'deleted' | 'renamed' | 'moved';
    suggestion?: string;  // Possible new path
  }>;
  
  unlistedFiles: Array<{
    agentPath: string;
    relatedFile: string;
    confidence: number;   // How sure are we it's related
  }>;
}
```

**Detection logic:**
1. Parse `files:` from agent frontmatter
2. Check if each file exists in configured codebase path
3. If missing, search for similar filenames (fuzzy match)
4. If found elsewhere, suggest update
5. Optionally: scan code for files that reference agent's domain

### 3. Status Inference

Analyze patterns to suggest status updates:

```typescript
interface StatusInference {
  agentPath: string;
  currentStatus: string;
  suggestedStatus: string;
  confidence: number;
  reasons: string[];
}
```

**Inference rules:**
- GAP → WIP: Files in `files:` have recent commits
- WIP → PASS: All files exist, tests pass (if detectable), no TODOs
- WIP → BLOCKED: Dependencies stuck in GAP/BLOCKED for 7+ days
- Any → BLOCKED: Agent mentions "blocked" or "waiting" in content

### 4. Dependency Health Check

Validate dependency graph:

```typescript
interface DependencyHealth {
  circular: Array<{
    cycle: string[];  // ["001", "003", "001"]
  }>;
  
  blocked: Array<{
    agent: string;
    blockedBy: string;
    blockedDays: number;
  }>;
  
  orphaned: Array<{
    agent: string;
    dependsOn: string;
    reason: 'not_found' | 'different_plan';
  }>;
}
```

### 5. Auto-Update Proposals

Generate update suggestions (human reviews before applying):

```typescript
interface UpdateProposal {
  id: string;
  type: 'frontmatter' | 'status' | 'content' | 'file_list';
  target: string;           // File path
  field?: string;           // Specific field
  currentValue: any;
  proposedValue: any;
  reason: string;
  confidence: number;       // 0-1
  autoApplyable: boolean;   // Safe to auto-apply?
}
```

**Example proposals:**
```json
[
  {
    "type": "status",
    "target": "agents/003.agent.md",
    "field": "status",
    "currentValue": "WIP",
    "proposedValue": "PASS",
    "reason": "All files exist, no activity in 14 days, marked complete in PR #234",
    "confidence": 0.85,
    "autoApplyable": false
  },
  {
    "type": "frontmatter",
    "target": "agents/005.agent.md",
    "field": "updated",
    "currentValue": "2026-01-01",
    "proposedValue": "2026-01-26",
    "reason": "File was modified but updated field not changed",
    "confidence": 1.0,
    "autoApplyable": true
  }
]
```

---

## New MCP Tools

### `check_staleness`

```typescript
tool: "check_staleness"
params: {
  planId?: string;          // Scope to plan
  threshold?: number;       // Days (default from config)
  includePass?: boolean;    // Include completed agents
}
returns: StalenessReport
```

### `check_drift`

```typescript
tool: "check_drift"
params: {
  planId?: string;
  codebasePath: string;     // Path to source code
  includeUnlisted?: boolean;
}
returns: DriftReport
```

### `infer_status`

```typescript
tool: "infer_status"
params: {
  agentId?: string;         // Specific agent
  planId?: string;          // All agents in plan
  minConfidence?: number;   // Filter low-confidence
}
returns: StatusInference[]
```

### `get_proposals`

```typescript
tool: "get_proposals"
params: {
  planId?: string;
  types?: string[];         // Filter by proposal type
  minConfidence?: number;
  autoApplyableOnly?: boolean;
}
returns: UpdateProposal[]
```

### `apply_proposal`

```typescript
tool: "apply_proposal"
params: {
  proposalId: string;
  confirm: boolean;         // Must be true
}
returns: {
  applied: boolean;
  path: string;
  backup: string;
}
```

---

## CLI Commands

```bash
# Check for stale content
limps health staleness
limps health staleness --plan 0027 --days 7

# Check code drift
limps health drift --codebase ~/code/myproject
limps health drift --plan 0027

# Get all health issues
limps health check
limps health check --json

# Get update proposals
limps proposals
limps proposals --plan 0027 --auto-only

# Apply a proposal
limps proposals apply <proposal-id>

# Apply all safe proposals
limps proposals apply-safe
```

---

## Configuration

```json
{
  "health": {
    "staleness": {
      "enabled": true,
      "warningDays": 14,
      "criticalDays": 30,
      "excludeStatuses": ["PASS", "archived"]
    },
    "drift": {
      "enabled": true,
      "codebasePath": "../src",
      "watchPatterns": ["**/*.ts", "**/*.tsx"],
      "ignorePatterns": ["**/node_modules/**", "**/*.test.ts"]
    },
    "inference": {
      "enabled": true,
      "minConfidence": 0.7,
      "rules": {
        "wipToPass": true,
        "gapToWip": true,
        "detectBlocked": true
      }
    },
    "proposals": {
      "autoApply": ["updated_field"],  // Auto-apply these types
      "requireConfirmation": ["status", "content"]
    }
  }
}
```

---

## Implementation Plan

### Phase 1: Staleness Detection
- [x] Track file modification times
- [x] `check_staleness` tool
- [x] CLI `limps health staleness`
- [x] Warning/critical thresholds

### Phase 2: Code Drift
- [x] Parse `files:` from frontmatter
- [x] File existence checking
- [x] Fuzzy filename matching
- [x] `check_drift` tool

### Phase 3: Status Inference
- [x] Rule-based inference engine
- [ ] Git history integration (optional)
- [x] `infer_status` tool
- [x] Confidence scoring

### Phase 4: Proposal System
- [x] Proposal generation
- [x] Proposal storage/tracking (on-demand from health checks)
- [x] `get_proposals` / `apply_proposal` tools
- [x] CLI commands

### Phase 5: Automation
- [x] Background health checks (limps health check)
- [ ] Notification hooks (for future Slack integration)
- [x] Auto-apply safe proposals option (config-driven)

---

## Integration Points

- **0029 Semantic Search**: Use embeddings to find related content
- **0030 Scoring Weights**: Factor health into task scoring
- **0031 Frontmatter**: Ensure `updated` field stays current
- **0034 Integrations**: Notify Slack/Discord of health issues
- **0042 Knowledge Graph**: Health checks feed into `limps graph health` command
- **0047 Context Hierarchy**: Staleness detection shared between context files and plans; memory drift detection

---

## Success Criteria

- [ ] Detects plans not touched in 30+ days
- [ ] Finds renamed/deleted files in `files:` field
- [ ] Suggests WIP → PASS when agent looks complete
- [ ] Proposals are accurate (>80% accepted by user)
- [ ] No false positives on PASS agents

---

## Status

Status: Active
Work Type: feature
Created: 2026-01-26
