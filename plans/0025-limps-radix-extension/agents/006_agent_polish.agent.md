---
title: Provider Architecture & Polish
status: GAP
persona: coder
dependencies:
  - 003_agent_read-tools.agent.md
  - 004_agent_analyzer.agent.md
  - 005_agent_differ.agent.md
files:
  - path: src/providers/interface.ts
    action: create
  - path: src/providers/registry.ts
    action: create
  - path: src/providers/radix.ts
    action: create
  - path: src/providers/index.ts
    action: create
  - path: src/cli/index.ts
    action: create
  - path: src/cli/commands/extract.ts
    action: create
  - path: src/cli/commands/analyze.ts
    action: create
  - path: src/cli/commands/diff.ts
    action: create
  - path: src/cli/commands/list.ts
    action: create
  - path: bin/limps-radix
    action: create
  - path: README.md
    action: create
  - path: docs/tools.md
    action: create
  - path: docs/architecture.md
    action: create
  - path: docs/providers.md
    action: create
---

# Agent 006: Provider Architecture & Polish

**Plan Location**: `plans/0025-limps-radix-extension/plan.md`

## Scope

Features: #16 (Provider Architecture), #17 (CLI Commands), #18 (Documentation)
Own: `src/providers/`, `src/cli/`, `docs/`, `README.md`
Depend on: Agents 003-005 for tool implementations
Block: None (final polish)

## Interfaces

### Export

```typescript
// src/providers/interface.ts
export interface ComponentLibraryProvider {
  name: string;
  displayName: string;
  listPrimitives(version: string): Promise<string[]>;
  resolveVersion(versionHint: string): Promise<string>;
  fetchTypes(primitive: string, version: string): Promise<string>;
  extract?(typeContent: string): ExtractedPrimitive;
  generateSignature?(extracted: ExtractedPrimitive): BehaviorSignature;
}

// src/providers/registry.ts
export const providers: ProviderRegistry;
export function registerProvider(provider: ComponentLibraryProvider): void;
export function getProvider(name: string): ComponentLibraryProvider;
```

### Receive

```typescript
// From fetcher (Agent 001) - to wrap in RadixProvider
import { resolveVersion, fetchTypes, listPrimitives } from '../fetcher/index.js';
import { extractPrimitive } from '../extractor/index.js';
import { generateSignature } from '../signatures/index.js';
```

---

## Features

### #16: Provider Architecture

TL;DR: Pluggable system for other component libraries
Status: `GAP`

TDD:
1. `ComponentLibraryProvider interface defined` → create types
2. `RadixProvider implements interface` → wrap existing code
3. `registry.register adds provider` → map storage
4. `registry.get retrieves by name` → lookup
5. `tools accept provider param` → add to schemas → use registry

Provider implementation pattern:
```typescript
// src/providers/radix.ts
export const radixProvider: ComponentLibraryProvider = {
  name: 'radix',
  displayName: 'Radix UI',
  
  async listPrimitives(version) {
    return listPrimitives(version);
  },
  
  async resolveVersion(hint) {
    return resolveVersion('dialog', hint); // Any primitive works
  },
  
  async fetchTypes(primitive, version) {
    return fetchTypes(primitive, version);
  },
  
  // Use default extraction/signature generation
  // (don't override extract/generateSignature)
};
```

Tool schema update:
```typescript
// Add to all tools
properties: {
  provider: { 
    type: 'string', 
    description: 'Component library (default: radix)',
    default: 'radix'
  }
}
```

### #17: CLI Commands

TL;DR: Standalone CLI for non-MCP usage
Status: `GAP`

TDD:
1. `commander parses commands` → setup → help works
2. `list outputs primitives` → call handler → format
3. `extract outputs contract` → call handler → format
4. `analyze outputs recommendation` → call handler → format
5. `diff outputs changes` → call handler → format
6. `--json outputs JSON` → check flag → format

CLI structure:
```bash
limps-radix list [--version] [--json]
limps-radix extract <primitive> [--version] [--json]
limps-radix analyze <file> [--version] [--threshold] [--json]
limps-radix diff <from> [--to] [--primitives] [--breaking-only] [--json]
limps-radix check-updates [--refresh] [--json]
```

bin/limps-radix:
```bash
#!/usr/bin/env node
import '../dist/cli/index.js';
```

### #18: Documentation

TL;DR: README + tool docs + architecture + provider guide
Status: `GAP`

README.md outline:
```markdown
# limps-radix

Radix UI contract extraction and drift detection for limps.

## Quick Start
npm install @sudosandwich/limps-radix
limps config set extensions '["@sudosandwich/limps-radix"]'

## Tools
- radix_list_primitives
- radix_extract_primitive
- radix_analyze_component
- radix_diff_versions
- radix_check_updates

## CLI
limps-radix --help

## Links
- [Tool Reference](./docs/tools.md)
- [Architecture](./docs/architecture.md)
- [Adding Providers](./docs/providers.md)
```

docs/tools.md - Each tool with:
- Description
- Input schema
- Output schema
- Examples

docs/providers.md - How to:
- Implement ComponentLibraryProvider
- Register with limps-radix
- Test your provider

---

## Done

- [ ] ComponentLibraryProvider interface defined
- [ ] RadixProvider wraps existing code
- [ ] Provider registry works
- [ ] Tools accept provider parameter
- [ ] CLI entry point works
- [ ] All 5 commands implemented
- [ ] --json flag on all commands
- [ ] README with quick start
- [ ] docs/tools.md with examples
- [ ] docs/architecture.md overview
- [ ] docs/providers.md guide
