---
status: WIP
priority: 100
created: 2026-02-14
---

# 0050 — Obsidian Deep Integration

## Goal

Transform the Obsidian plugin from a CLI-wrapper probe into a fully autonomous planning layer with persistent MCP sessions, bidirectional control, scheduled health checks, 60GB+ scale support, and deep relationship analysis.

## Agents

| # | Title | Status | Batch | Depends On |
|---|-------|--------|-------|------------|
| 000 | Server Session Robustness | GAP | 0 | — |
| 001 | McpClientManager Class | GAP | 0 | — |
| 002 | Plugin MCP Integration | GAP | 1 | 000, 001 |
| 003 | MCP Tool Wrapper | GAP | 1 | 001 |
| 004 | Document Management Commands | GAP | 2 | 002, 003 |
| 005 | Task Management UI | GAP | 2 | 002, 003 |
| 006 | Search Modal + Proposals UI | GAP | 2 | 002, 003 |
| 007 | Presence-Aware Indexing + Smart Exclusions | GAP | 3 | — |
| 008 | Multi-Path Config + Streaming Scanner | GAP | 3 | — |
| 009 | Scheduled Health Checks + Vault Automation | GAP | 4 | 002 |
| 010 | Auto-Proposal Application + Notifications | GAP | 4 | 006 |
| 011 | Structural Document Analysis + Cross-Doc Links | GAP | 5 | 007 |
| 012 | Conflict Detection + Relationship Discovery | GAP | 5 | 008 |
| 013 | Documentation | GAP | 6 | all |
| 014 | Integration Tests + E2E Validation | GAP | 6 | all |

## Key Decisions

- Persistent MCP via `StreamableHTTPClientTransport` with auto-reconnect
- Dual-mode: MCP preferred, CLI fallback
- Presence-aware indexing for 60GB+ scale (know files exist without parsing)
- Smart exclusions default: node_modules, .git, vendor, build, __pycache__, *.pyc, *.so, .DS_Store
- File watcher must NOT watch paths we don't care about (presence-only paths excluded from watcher)
