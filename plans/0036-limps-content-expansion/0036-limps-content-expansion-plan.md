---
title: limps Content Expansion
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature]
created: 2026-01-26
updated: 2026-01-27
---

# limps Content Expansion

## Overview

Expand limps beyond planning documents. ADRs, runbooks, meeting notes - knowledge management is the endgame. Planning is step 1.

## Content Types

| Type | Purpose | Structure |
|------|---------|-----------|
| **Plans** | Feature planning (current) | {plan-name}-plan.md + agents |
| **ADRs** | Architecture decisions | Single doc with status |
| **Runbooks** | Operational procedures | Steps + automation |
| **Meeting Notes** | Capture → action items | Template-driven |
| **Knowledge Base** | General docs | Wiki-style |
| **API References** | OpenAPI → readable | Auto-generated |

---

## 1. Architecture Decision Records (ADRs)

Capture "why" decisions were made.

> **Note**: ADR supersession chains and staleness tracking are now handled by **Plan 0047 (Context Hierarchy)**. This section defines the schema and tools; 0047 handles inheritance and lifecycle.

### Schema

```yaml
---
title: "Use SQLite for vector storage"
type: adr
status: accepted | proposed | deprecated | superseded
date: 2026-01-26
deciders: [paul, claude]
supersedes: ADR-0003  # Optional
superseded_by: null    # Filled if superseded
tags: [database, vectors, architecture]
---

# ADR-0005: Use SQLite for vector storage

## Context
We need vector storage for semantic search...

## Decision
We will use sqlite-vec extension...

## Consequences
### Positive
- All local, no external deps
- Fits existing SQLite architecture

### Negative
- Less battle-tested than Chroma/Pinecone

## Alternatives Considered
1. Chroma - Too heavy for local use
2. Pinecone - Requires cloud
```

### Directory Structure

```
docs/
├── adrs/
│   ├── ADR-0001-use-mcp.md
│   ├── ADR-0002-sqlite-fts5.md
│   ├── ADR-0003-vector-db-choice.md  # deprecated
│   └── ADR-0004-sqlite-vec.md
└── adr-index.md  # Auto-generated
```

### MCP Tools

```typescript
tool: "create_adr"
params: {
  title: string;
  context: string;
  decision: string;
  consequences?: {
    positive: string[];
    negative: string[];
  };
}

tool: "list_adrs"
params: {
  status?: string;  // Filter by status
}

tool: "supersede_adr"
params: {
  adrId: string;
  newAdrId: string;
}
```

---

## 2. Runbooks

Operational procedures with executable steps.

### Schema

```yaml
---
title: "Deploy to Production"
type: runbook
category: deployment
severity: critical
estimated_time: 15m
last_verified: 2026-01-20
tags: [deploy, production, ci-cd]
---

# Deploy to Production

## Prerequisites
- [ ] All tests passing
- [ ] PR approved
- [ ] Changelog updated

## Steps

### 1. Create release branch
```bash
git checkout -b release/v1.2.0
```

### 2. Run deployment
```bash
npm run deploy:prod
```
> ⚠️ **Warning:** This will trigger production deployment

### 3. Verify deployment
- [ ] Health check passes: `curl https://api.example.com/health`
- [ ] Smoke tests pass

## Rollback
If issues occur:
```bash
npm run rollback:prod
```

## Contacts
- On-call: #ops-oncall
- Escalation: @paul
```

### Features

- **Checklists**: Track completion
- **Executable blocks**: Mark commands as runnable
- **Verification steps**: Automated checks
- **Severity levels**: Triage urgency

### MCP Tools

```typescript
tool: "create_runbook"
params: {
  title: string;
  category: string;
  steps: Step[];
  prerequisites?: string[];
}

tool: "list_runbooks"
params: {
  category?: string;
  severity?: string;
}

tool: "start_runbook"
params: {
  runbookId: string;
}
returns: {
  sessionId: string;  // Track progress
  steps: Step[];
  currentStep: number;
}

tool: "complete_step"
params: {
  sessionId: string;
  stepIndex: number;
  notes?: string;
}
```

---

## 3. Meeting Notes

Structured capture with action item extraction.

### Schema

```yaml
---
title: "Sprint Planning - Jan 26"
type: meeting
date: 2026-01-26
attendees: [paul, alice, bob]
tags: [sprint, planning]
---

# Sprint Planning - Jan 26

## Agenda
1. Review last sprint
2. Plan next sprint
3. Blockers discussion

## Notes
- Discussed feature X progress
- Alice raised concern about Y

## Decisions
- Will prioritize feature X over Y
- Bob to investigate Z

## Action Items
- [ ] @paul: Update roadmap by EOD
- [ ] @alice: Create PR for fix
- [ ] @bob: Research options for Z
```

### Features

- **Action item extraction**: Auto-detect `- [ ] @person: task`
- **Decision tracking**: Link to ADRs
- **Attendee tagging**: Who was there
- **Follow-up generation**: Create tasks from action items

### MCP Tools

```typescript
tool: "create_meeting"
params: {
  title: string;
  date: string;
  attendees: string[];
  agenda?: string[];
}

tool: "extract_actions"
params: {
  meetingId: string;
}
returns: {
  actions: Array<{
    assignee: string;
    task: string;
    deadline?: string;
  }>;
}

tool: "actions_to_agents"
params: {
  meetingId: string;
  planId: string;  // Add as agents to this plan
}
```

---

## 4. Knowledge Base Mode

Wiki-style docs without agent workflow.

### Use Cases

- Team onboarding docs
- API guides
- Best practices
- FAQ

### Schema

```yaml
---
title: "Getting Started with limps"
type: kb
category: guides
author: paul
last_updated: 2026-01-26
tags: [getting-started, onboarding]
---
```

### Directory Structure

```
kb/
├── guides/
│   ├── getting-started.md
│   └── advanced-usage.md
├── reference/
│   ├── mcp-tools.md
│   └── configuration.md
└── faq/
    └── troubleshooting.md
```

### Features

- **Categories**: Organize by topic
- **Cross-linking**: Wikilinks between docs
- **Search integration**: FTS5 + semantic
- **Version history**: Track changes

---

## 5. API Reference Parsing

Import OpenAPI specs as limps docs.

### Features

```typescript
tool: "import_openapi"
params: {
  path: string;       // Path to openapi.yaml
  outputDir: string;  // Where to write docs
  format?: "full" | "summary";
}

// Generates:
// - api-overview.md
// - endpoints/
//   - users.md
//   - auth.md
//   - etc.
```

### Generated Format

```yaml
---
title: "POST /users"
type: api
method: POST
path: /users
tags: [users, api]
---

# Create User

## Request
### Body
```json
{
  "name": "string",
  "email": "string"
}
```

## Response
### 201 Created
```json
{
  "id": "string",
  "name": "string"
}
```
```

---

## Configuration

```json
{
  "content": {
    "types": {
      "adr": {
        "enabled": true,
        "path": "docs/adrs",
        "autoIndex": true
      },
      "runbook": {
        "enabled": true,
        "path": "docs/runbooks",
        "categories": ["deployment", "incident", "maintenance"]
      },
      "meeting": {
        "enabled": true,
        "path": "docs/meetings",
        "extractActions": true
      },
      "kb": {
        "enabled": true,
        "path": "kb",
        "categories": ["guides", "reference", "faq"]
      }
    }
  }
}
```

---

## CLI Commands

```bash
# ADRs
limps adr create "Use Redis for caching"
limps adr list --status proposed
limps adr supersede ADR-0003 ADR-0007

# Runbooks
limps runbook create deployment/release
limps runbook list --category deployment
limps runbook run deployment/release

# Meetings
limps meeting create "Sprint Planning"
limps meeting extract-actions 2026-01-26-sprint

# Knowledge Base
limps kb create guides/getting-started
limps kb search "authentication"

# API Import
limps api import openapi.yaml --output docs/api
```

---

## Implementation Plan

### Phase 1: ADRs
- [ ] ADR schema definition
- [ ] `create_adr` / `list_adrs` tools
- [ ] Auto-index generation
- [ ] Supersede workflow

### Phase 2: Runbooks
- [ ] Runbook schema
- [ ] Step tracking
- [ ] Session management
- [ ] Executable block marking

### Phase 3: Meeting Notes
- [ ] Meeting schema
- [ ] Action item extraction
- [ ] Action → agent conversion

### Phase 4: Knowledge Base
- [ ] KB schema
- [ ] Category management
- [ ] Cross-linking
- [ ] Search integration

### Phase 5: API Reference
- [ ] OpenAPI parser
- [ ] Doc generation
- [ ] Auto-update on spec change

---

## Success Criteria

- [ ] ADRs track architectural decisions with history
- [ ] Runbooks guide ops procedures step-by-step
- [ ] Meeting action items become trackable tasks
- [ ] KB provides searchable team knowledge
- [ ] All content types work with semantic search

---

## Status

Status: Planning
Work Type: feature
Created: 2026-01-26
