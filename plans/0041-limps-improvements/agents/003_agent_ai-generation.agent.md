# Agent 3: AI Generation

**Plan Location**: `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

## Scope

Features: #5
Own: `packages/limps/src/tools/generate-requirements.ts`, `packages/limps/src/tools/index.ts`
Depend on: none
Block: Agent 4 needs docs for AI_DRAFT

## Interfaces

### Export

- generate_requirements MCP tool

### Receive

- None

## Features

### #5: AI-Assisted Requirements Generation

TL;DR: Generate requirements artifacts with AI_DRAFT status.
Status: `GAP`
Test IDs: `generate-requirements-template`, `generate-requirements-llm-optional`
Files: `packages/limps/src/tools/generate-requirements.ts`

TDD:
1. `generate-requirements-template` → impl → refactor
2. `generate-requirements-llm-optional` → impl → refactor

## Done

- [ ] Draft output with checklist
- [ ] Optional LLM sub-query is explicit
