# Agent 4: Docs

**Plan Location**: `plans/0041-limps-improvements/0041-limps-improvements-plan.md`

## Scope

Features: #5
Own: `README.md`, `docs/semantic-setup.md`, `config.json.example`
Depend on: Agents 0, 1, 2 (need finalized tool names and config)
Block: None

## Interfaces

### Export

- Updated README sections
- Semantic setup guide
- Config reference
- Troubleshooting guide

### Receive

- Finalized tool names, config keys, error messages from Agents 0-2

## Features

### #5: Documentation Updates

TL;DR: Document semantic setup, query tools, config reference, and troubleshooting.
Status: `GAP`
Test IDs: `docs-semantic-setup`, `docs-config-reference`, `docs-troubleshooting`
Files: `README.md`, `docs/semantic-setup.md`, `config.json.example`

**Documentation Sections:**

1. **Semantic Setup Guide**
   - Ollama installation (macOS, Linux, Windows)
   - Model download: `ollama pull nomic-embed-text`
   - Config enable: `semantic.enabled: true`
   - Verification: how to confirm it's working

2. **Config Reference**
   - All semantic.* options with defaults and descriptions
   - Character-based chunking explanation (2000 chars ≈ 500 tokens)
   - Model compatibility notes (768-dim models recommended)

3. **Troubleshooting**
   - "Ollama not running" — symptoms, fix
   - "Wrong model dimensions" — symptoms, fix
   - "Embeddings not updating" — hash caching + model_name explanation
   - "Slow indexing" — batching, background indexing tips
   - "Model changed, old embeddings" — reindex_vectors with force

4. **Tool Reference**
   - semantic_search, find_similar, reindex_vectors signatures
   - query_docs with/without semantic
   - Example usage for each

TDD:
1. `docs-semantic-setup` → impl Ollama setup guide → refactor
2. `docs-config-reference` → impl config documentation → refactor
3. `docs-troubleshooting` → impl common issues guide → refactor

## Done

- [ ] README updated with semantic overview
- [ ] Semantic setup guide (Ollama install, model, config)
- [ ] Config reference with all options
- [ ] Troubleshooting guide
- [ ] Tool reference with examples
- [ ] config.json.example updated
