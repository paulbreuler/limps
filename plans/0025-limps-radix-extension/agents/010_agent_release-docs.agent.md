---
title: MVP Release Documentation
status: PASS
persona: coder
dependencies: []
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#010", "Release Docs Agent"]
created: 2026-01-28
updated: 2026-01-28
files:
  - path: packages/limps-radix/README.md
    action: create
---

# Agent 010: MVP Release Documentation

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #22 (MVP Release Documentation)
Own: `packages/limps-radix/README.md`
Depend on: None (can work in parallel with Agent 011)
Block: None

## Problem

The package is ready for v0.1.0 release but lacks README.md documentation. npm packages require README.md for discoverability and usage guidance.

## Interfaces

### Export

```typescript
// packages/limps-radix/README.md
// Markdown documentation file (no TypeScript exports)
```

### Receive

```typescript
// No dependencies - standalone documentation
```

---

## Features

### #22: MVP Release Documentation

TL;DR: Create comprehensive README.md for v0.1.0 release
Status: `PASS`

TDD:
1. `README has installation section` → Add npm install command → Include peer dependency note
2. `README has usage examples` → Add MCP tool examples → Include JSON output samples
3. `README documents API` → Add exported types section → Link to source
4. `README explains configuration` → Add config section → Include example

Required sections:
- **Installation**: npm install command, peer dependencies
- **Quick Start**: Basic usage example
- **MCP Tools**: Documentation for `radix_list_primitives` and `radix_extract_primitive`
- **API Reference**: Exported types and interfaces
- **Configuration**: Extension configuration options
- **Examples**: Real-world usage examples with JSON outputs

---

## TDD Cycles

### 1. Installation section

```markdown
## Installation

```bash
npm install @sudosandwich/limps-radix
```

**Peer Dependencies**: Requires `@sudosandwich/limps@^2.0.0`
```

Test: README includes installation instructions
Impl: Add installation section with npm command
Refactor: Include peer dependency requirement

### 2. Quick start example

```markdown
## Quick Start

Add to your limps config:

```json
{
  "extensions": ["@sudosandwich/limps-radix"]
}
```

Then use the MCP tools in your AI assistant.
```

Test: README has quick start guide
Impl: Add configuration example
Refactor: Include extension loading note

### 3. MCP tool documentation

```markdown
## MCP Tools

### radix_list_primitives

List all available Radix UI primitives.

**Input:**
```json
{
  "version": "latest" // optional
}
```

**Output:**
```json
{
  "version": "1.1.2",
  "primitives": [
    { "name": "dialog", "package": "@radix-ui/react-dialog" },
    ...
  ]
}
```
```

Test: README documents both MCP tools
Impl: Add tool documentation with input/output examples
Refactor: Include real JSON output samples

### 4. API reference

```markdown
## API Reference

### Types

- `ExtractedPrimitive` - Raw extraction from Radix .d.ts files
- `BehaviorSignature` - Semantic behavioral contract
- `PropDefinition` - Prop metadata with classification
```

Test: README documents exported types
Impl: Add API section listing key types
Refactor: Link to source code or provide brief descriptions

### 5. Configuration

```markdown
## Configuration

Extension configuration in `limps.config.json`:

```json
{
  "extensions": ["@sudosandwich/limps-radix"],
  "radix": {
    "cacheDir": ".cache/radix"
  }
}
```
```

Test: README explains configuration
Impl: Add configuration section
Refactor: Include all available options

---

## Acceptance Criteria

- [x] README.md exists in `packages/limps-radix/`
- [x] Installation section with npm command
- [x] Quick start guide with config example
- [x] MCP tool documentation for both tools
- [x] API reference section
- [x] Configuration section
- [x] Examples with real JSON outputs
- [x] Professional formatting and structure

---

## Notes

- Target audience: Developers using limps with MCP clients (Claude Desktop, Cursor, etc.)
- Focus on practical usage, not implementation details
- Include real examples from actual tool outputs
- Keep it concise but comprehensive
- Reference the plan file for feature details if needed
