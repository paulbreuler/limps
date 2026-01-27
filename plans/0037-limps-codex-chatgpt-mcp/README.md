# Plan 0037: Codex + ChatGPT MCP Setup

## Status Matrix

| Feature | Status |
| --- | --- |
| #1 Codex MCP Client Adapter | GAP |
| #2 ChatGPT MCP Setup Guidance | GAP |
| #3 Docs + CLI UX Updates | GAP |

## Dependency Graph

```mermaid
graph TD
  F1[Feature 1: Codex Adapter]
  F2[Feature 2: ChatGPT Instructions]
  F3[Feature 3: Docs + CLI UX]

  F1 --> F3
  F2 --> F3
```

## Agents

- Agent 000: Codex adapter + tests
- Agent 001: ChatGPT instructions + CLI/README updates
