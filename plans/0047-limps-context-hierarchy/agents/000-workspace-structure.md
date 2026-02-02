---
title: Workspace Structure
status: GAP
persona: coder
depends_on: []
files:
  - src/context/workspace.ts
  - src/context/schemas.ts
  - src/cli/commands/workspace/init.ts
tags: [context, workspace, structure]
---

# Agent 000: Workspace Structure

## Objective

Define the `.limps/` workspace structure and implement initialization.

## Tasks

1. **Define schemas** (`src/context/schemas.ts`)
   - `WorkspaceConfig`: workspace.md frontmatter
   - `ContextFile`: vision.md, brand.md, etc.
   - `ADRFile`: Architecture Decision Record
   - Validation functions for each

2. **Workspace utilities** (`src/context/workspace.ts`)
   - `findWorkspaceRoot()`: Walk up to find .limps/
   - `isValidWorkspace()`: Check structure integrity
   - `getWorkspaceConfig()`: Parse workspace.md

3. **Init command** (`src/cli/commands/workspace/init.ts`)
   - Create `.limps/` directory structure
   - Generate workspace.md with prompts
   - Create context/ and adrs/ directories
   - Add .gitkeep files

## Directory Structure

```
.limps/
├── workspace.md           # Workspace config
├── context/
│   ├── vision.md
│   ├── brand.md
│   ├── architecture.md
│   └── nfrs.md
├── adrs/
│   └── .gitkeep
└── archive/
    └── .gitkeep
```

## Acceptance Criteria

- [ ] `limps workspace init` creates full structure
- [ ] workspace.md schema is validated
- [ ] `findWorkspaceRoot()` works from nested directories
- [ ] Context files have consistent frontmatter
- [ ] Refuses to init if workspace already exists
