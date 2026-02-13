# LIMPS Obsidian Deep Integration Requirements

## Authoritative references

- Obsidian docs home: <https://docs.obsidian.md/Home>
- Build a plugin: <https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin>
- Custom views API: <https://docs.obsidian.md/Plugins/User+interface/Views>
- Plugin API reference: <https://docs.obsidian.md/Reference/TypeScript+API/Plugin>
- Graph view behavior and settings (including arrows): <https://help.obsidian.md/plugins/Graph+view>
- Internal links (wikilinks and markdown links): <https://help.obsidian.md/linking-notes-and-files/internal-links>

## Reputable graph stack

- Directed graph rendering uses Cytoscape.js + Dagre layout:
  - <https://js.cytoscape.org/>
  - <https://github.com/cytoscape/cytoscape.js-dagre>

## Current implemented baseline (v0.0.2)

- Health sidebar view with daemon checks and auto-refresh.
- Graph sync commands to project LIMPS relations into Markdown links for Obsidian Graph.
- Dependency conversion command with compatibility fallback when older `limps` binaries do not support `--json`.
- Binary management improvements:
  - system binary mode
  - explicit path mode
  - repo-binary helper + command
  - PATH-miss fallback to repo binary (`packages/limps/dist/cli.js`) when available.
- Directed LIMPS graph custom view (`limps:open-directed-graph-view`):
  - edge types: `depends_on`, `blocks`, plan containment, related docs/canvas/base
  - cycle detection summary
  - unresolved relation warnings
  - click nodes to open files

## Remaining requirements

### P0

- Add a graph completeness audit report command that writes a deterministic Markdown report in vault (isolated nodes, unresolved refs, cycle details).
- Add “Fix now” actions for unresolved dependencies (convert numeric/path refs and resync links in one workflow).
- Add integration tests that validate plugin commands against a running limps daemon on expected config/port.

### P1

- Add per-plan filtering and edge-type toggles in directed graph view.
- Add local graph drill-down from currently opened note/agent.
- Add explicit cycle navigation (jump between nodes in cycle).
- Add edge labels and relation counts that can be toggled on/off for large graphs.

### P2

- Add plugin support for richer `.canvas` and `.base` relationship extraction (not just file-level links).
- Add MCP-governed workflows for graph maintenance (scheduled validation/fix routines).
- Add optional export/import of LIMPS graph snapshots (JSON) for offline diffing.

## Acceptance criteria for “deep integration” phase

- A user can open one LIMPS-directed graph pane and immediately see directed relationships across plans/agents/docs/canvas/base.
- A user can run one command to normalize dependencies, sync links, and get an auditable report of what changed.
- A user can detect cycles/unresolved relations and navigate directly to source files for remediation.
- Plugin behavior remains responsive under medium vault sizes (hundreds of nodes/edges).
