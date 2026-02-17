---
title: limps Obsidian Plugin Requirements (Userdoc-style)
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature, limps/priority/high, obsidian, requirements, graph]
created: 2026-02-13
updated: 2026-02-13
---

# limps Obsidian Plugin Requirements (Userdoc-style)

## 1) Product intent

Build a limps-powered Obsidian plugin suite that gives a "requirements operating system" experience similar to [userdoc.fyi](https://userdoc.fyi/), while staying native to Obsidian files and graph.

Primary outcome:
- Requirements, dependencies, risks, and traceability are first-class in Obsidian.
- Obsidian Graph is significantly denser and more useful because limps relationships are projected into valid internal links.
- Users can also open a directed custom graph view to inspect dependency direction and cycles.

## 2) Problem statement

Current state has three gaps:
- limps relationships can exist semantically but are not always materialized as Obsidian-recognized internal links.
- Numeric dependency references (for example `depends_on: [1, 2]`) are ambiguous for Obsidian Graph.
- Obsidian's built-in Graph is undirected by default unless users enable arrows, and it does not model domain-specific edge types out of the box.

## 3) Goals

1. Make limps relationships reliably visible in Obsidian Graph.
2. Provide one-click repair/sync workflows from plugin UI.
3. Add a custom directed graph view focused on limps dependency semantics.
4. Provide a requirements-centric UX (plans, agents, stories, acceptance criteria, traceability, health).
5. Keep source of truth in Markdown files and limps CLI.
6. Go all-in on Obsidian native APIs instead of a generic wrapper UX.

## 4) Non-goals

1. Replacing Obsidian's native Graph implementation.
2. Creating a remote SaaS backend for requirements data.
3. Introducing a separate database as source of truth in MVP.

## 5) Official-doc constraints and implications

The implementation must follow these official Obsidian constraints:

1. Obsidian Graph edges are based on internal links between notes.
Evidence:
- Graph view docs: lines represent internal links.
- Internal links docs: supported formats are Wikilink and Markdown internal links.
Implication:
- limps relationships must be projected to valid internal note links or Graph stays sparse.

2. Markdown internal links are first-class and supported.
Evidence:
- Internal links docs show markdown format is equivalent to wikilink for note linking.
Implication:
- We can use Markdown links for interoperability and still feed Graph.

3. Custom views are supported via `ItemView`, `WorkspaceLeaf`, and `registerView`.
Evidence:
- Developer docs "Views" and TypeScript API.
Implication:
- A directed limps graph view inside an editor pane is supported and should be implemented as a custom view.

4. Plugins can use TypeScript and can use React if needed.
Evidence:
- Developer docs "Build a plugin" and "Use React in your plugin".
Implication:
- Keep current TS baseline; adopt React for complex interactive graph UI if DOM-only becomes cumbersome.

5. Graph styling has documented CSS variables.
Evidence:
- CSS variables reference for Graph plugin (`--graph-*`).
Implication:
- We can theme native graph readability using CSS variables and snippets, while keeping custom view styling separate.

6. Plugin manifest and lifecycle rules must be respected.
Evidence:
- Manifest reference and getting-started docs.
Implication:
- Maintain valid `manifest.json`, folder `id` match for local dev, and clean resource teardown on unload.

7. Obsidian exposes resolved/unresolved link maps through `MetadataCache`.
Evidence:
- TypeScript API `metadataCache.resolvedLinks`, `unresolvedLinks`, `fileToLinktext`, `getFirstLinkpathDest`.
Implication:
- Plugin can measure graph coverage, detect unresolved projections, and offer automated fixes.

## 6) Personas and core jobs

1. Product/Founder
- Needs to see scope, dependencies, risks, and progress quickly.

2. Engineer/Agent owner
- Needs clear upstream/downstream dependencies and no cycle surprises.

3. Planner/PM
- Needs traceability from plan goals to agent execution and acceptance checks.

## 7) Functional requirements

### FR-001: Bootstrap and daemon clarity
1. Plugin must clearly show daemon disconnected/connected state.
2. Plugin must provide exact command(s) to start limps daemon.
3. Health refresh must update in place without full view re-mount.

### FR-002: Dependency normalization
1. Plugin command: convert numeric dependencies to file-path dependencies using limps CLI.
2. Conversion supports both numeric references and path-like references.
3. Report includes `converted` count and `filesUpdated` count.
4. Failures show actionable error text, not stack-only output.

### FR-003: Graph projection engine
1. Plugin command syncs limps relationships into internal Markdown links in notes.
2. Projection includes at minimum:
- `depends_on` and `dependencies`
- related documents
- plan-to-agent links
3. Projection must avoid duplicate link spam and keep idempotent output.
4. Projection must emit unresolved-target warnings when destination cannot be found.

### FR-004: Graph coverage diagnostics
1. Plugin computes and shows:
- total notes
- linked notes
- unresolved projected links
- orphan count
2. Plugin can show why graph appears sparse:
- excluded files
- unresolved links
- no projected relationships

### FR-005: Directed limps graph view (custom view)
1. Add custom `ItemView` named "limps Directed Graph".
2. Nodes: plans, agents, docs (configurable).
3. Edges: `depends_on`, `related_to`, `blocks`, `parent_of` (configurable).
4. Directional arrows always visible in this custom view.
5. Click node opens note in Obsidian.
6. Hover node reveals incoming/outgoing edge counts.
7. Detect cycles and highlight them.
8. Provide "Topological order" panel when acyclic.

### FR-006: Requirements workspace (userdoc-style MVP)
1. Create requirement records from templates:
- Feature
- User story
- Acceptance criteria
- Non-functional requirement
- Risk
- Decision
2. Each record must include:
- owner
- status
- priority
- source links
- downstream links
3. Auto-linking:
- create links to parent plan and related agents/documents.
4. Traceability panel:
- map feature -> story -> acceptance criteria -> agent/task artifacts.

### FR-007: Usability and creature comforts
1. Quick actions in one place:
- refresh health
- check daemon
- reindex
- convert deps
- sync graph links
2. Countdown to next health check.
3. "Copy fix command" buttons for common failure states.
4. Safe dry-run mode for link sync/conversion.
5. Non-blocking notices with concise summaries.

### FR-008: Obsidian-native event orchestration
1. Plugin must react to vault lifecycle events:
- `create`
- `modify`
- `rename`
- `delete`
2. Plugin must react to metadata lifecycle events:
- `metadataCache.on('changed')`
- `metadataCache.on('resolved')`
3. Plugin must react to workspace context events:
- `workspace.on('file-open')`
- `workspace.on('active-leaf-change')`
4. Event handlers must debounce expensive work and avoid duplicate refresh storms.

### FR-009: Deep editor and reading-mode integration
1. Register `EditorSuggest` to autocomplete:
- plan IDs
- agent IDs
- dependency targets
- relation keywords
2. Register Markdown post processor to render limps semantic blocks in reading mode (badges, relation chips, status chips).
3. Register fenced code-block processor(s) such as `limps-query` to render live query results in notes.
4. All render hooks must fail safe: source Markdown remains valid if rendering fails.

### FR-010: Native Obsidian surface coverage
1. Command palette coverage for all high-value limps actions via `addCommand`.
2. Ribbon quick actions for health and graph sync via `addRibbonIcon`.
3. Status bar indicator via `addStatusBarItem`:
- connection state
- unresolved link count
- last index age
4. Dedicated `PluginSettingTab` with profiles:
- Production mode (system `limps` in PATH)
- Developer mode (custom binary path)

### FR-011: Safe file mutation semantics
1. Use `FileManager.processFrontMatter()` for frontmatter writes that mutate relation metadata.
2. Keep generated relation blocks in clearly marked sections to avoid user-content collisions.
3. File writes must be idempotent and stable across repeated runs.
4. Rename events must trigger relation/path reconciliation.

### FR-012: Advanced graph operations
1. "Graph completeness" audit command compares expected limps edges vs Obsidian-resolved edges.
2. "Repair unresolved links" command attempts deterministic correction using `getFirstLinkpathDest`.
3. "Canonical link rewrite" command uses Obsidian path semantics and preserves readable link text.
4. Native Graph assist:
- optional CSS variable presets for readability
- quick command to open graph with recommended settings checklist (arrows enabled, orphans visible during audits)

### FR-013: Requirements intelligence layer
1. Traceability matrix view:
- requirement -> story -> acceptance criteria -> agent/task -> evidence file.
2. Coverage scoring:
- link completeness
- acceptance criteria completeness
- dependency hygiene (no cycles, no unresolved refs)
3. Conflict/risk inbox:
- aggregate `limps graph health` warnings/errors
- jump-to-note actions for remediation
4. Requirement change impact preview:
- show downstream notes affected by edits before commit.

## 8) Data and linking requirements

1. Any relation intended to appear in Obsidian Graph must resolve to an internal link target.
2. Markdown links should use safe path encoding (URL-escaped where needed).
3. Link text generation should use Obsidian path-resolution semantics where possible.
4. Plugin must verify projections against `metadataCache.resolvedLinks` and `unresolvedLinks`.
5. Path collisions must be handled by using disambiguated link text/path.
6. Link projection must preserve human readability while maximizing resolvability.

## 9) Technical architecture requirements

1. Keep limps CLI as the source of truth for indexing and graph extraction.
2. Obsidian plugin executes limps commands with timeout and structured JSON parsing.
3. Graph projection logic remains deterministic and test-covered.
4. Custom directed graph view can start with plain DOM and move to React when interaction complexity requires it.
5. If Node/Electron APIs are required, keep plugin desktop-only in manifest.
6. Do not retain stale direct references to view instances; query leaves by type when needed.
7. Use `workspace.revealLeaf()` when opening plugin views to ensure they are loaded and visible.

## 10) Non-functional requirements

1. Reliability
- No plugin crash on CLI errors or malformed output.

2. Performance
- Health checks should not block UI interaction.
- Large vault projection should support incremental refresh.

3. Security
- No network calls required for core local workflows.
- Commands executed via explicit binary path or PATH resolution based on settings.

4. Maintainability
- Unit tests for CLI wrapper, parsing, projection, and cycle detection.
- Clear error taxonomy and user-facing remediation steps.

## 11) Release phases

### Phase A: Graph correctness and trust
1. Dependency normalization command is stable.
2. Graph link sync includes plan->agent and relation projection.
3. Coverage diagnostics explain sparse graph causes.

### Phase B: Directed graph UX
1. Ship custom directed graph view with cycle detection.
2. Add filters and node grouping for plan-centric inspection.

### Phase C: Userdoc-style requirements workspace
1. Template-driven requirement creation and traceability panel.
2. Requirement quality checks and completion scoring.

### Phase D: Obsidian deep integration
1. Ship editor suggest, markdown processors, and status bar/ribbon experience.
2. Ship event-driven incremental refresh for vault/metadata/workspace changes.
3. Ship graph completeness audits and unresolved-link repair workflows.

## 12) Acceptance criteria

1. After running conversion + sync on a representative vault, global Graph shows expected plan->agent and dependency connectivity (substantially fewer orphans).
2. Directed graph view can surface at least one cycle in a seeded cyclic dataset and show no cycles in an acyclic dataset.
3. Dependency conversion handles numeric IDs and path references without data loss.
4. Health panel updates in place with countdown and no full-pane remount behavior.
5. Core commands succeed or fail with clear actionable notices.
6. Editing a note with limps relations updates health/coverage state via event-driven refresh without manual reload.
7. Requirements notes render enhanced reading-mode UX while remaining valid plain Markdown.

## 13) Open questions

1. Should projections be written to dedicated generated sections only, or merged with existing author-written relationship sections?
2. Should cycle checks be hard-blocking for task execution commands or advisory-only?
3. Should directed graph use canvas/WebGL library in MVP, or start with simpler SVG layout?

## 14) Sources (official docs + product inspiration)

1. Obsidian Help: Internal links
https://help.obsidian.md/Linking+notes+and+files/Internal+links

2. Obsidian Help: Graph view
https://help.obsidian.md/Plugins/Graph+view

3. Obsidian Help: Outgoing links
https://help.obsidian.md/Plugins/Outgoing+links

4. Obsidian Help: Backlinks
https://help.obsidian.md/Plugins/Backlinks

5. Obsidian Developer Docs: Build a plugin
https://docs.obsidian.md/Plugins/Getting+started/Build+a+plugin

6. Obsidian Developer Docs: Views
https://docs.obsidian.md/Plugins/User+interface/Views

7. Obsidian Developer Docs: Use React in your plugin
https://docs.obsidian.md/Plugins/Getting+started/Use+React+in+your+plugin

8. Obsidian Developer Docs: Manifest reference
https://docs.obsidian.md/Reference/Manifest

9. Obsidian Developer Docs: TypeScript API `MetadataCache`
https://docs.obsidian.md/Reference/TypeScript+API/MetadataCache

10. Obsidian Developer Docs: CSS variables for Graph plugin
https://docs.obsidian.md/Reference/CSS+variables/Plugins/Graph

11. Obsidian Developer Docs: TypeScript API `Plugin.addCommand`
https://docs.obsidian.md/Reference/TypeScript+API/Plugin/addCommand

12. Obsidian Developer Docs: TypeScript API `Plugin.addStatusBarItem`
https://docs.obsidian.md/Reference/TypeScript+API/Plugin/addStatusBarItem

13. Obsidian Developer Docs: TypeScript API `Plugin.addRibbonIcon`
https://docs.obsidian.md/Reference/TypeScript+API/Plugin/addRibbonIcon

14. Obsidian Developer Docs: TypeScript API `Plugin.registerMarkdownPostProcessor`
https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerMarkdownPostProcessor

15. Obsidian Developer Docs: TypeScript API `Plugin.registerMarkdownCodeBlockProcessor`
https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerMarkdownCodeBlockProcessor

16. Obsidian Developer Docs: TypeScript API `Plugin.registerEditorSuggest`
https://docs.obsidian.md/Reference/TypeScript+API/Plugin/registerEditorSuggest

17. Obsidian Developer Docs: TypeScript API `Workspace` events
https://docs.obsidian.md/Reference/TypeScript+API/Workspace

18. Obsidian Developer Docs: TypeScript API `Vault` events
https://docs.obsidian.md/Reference/TypeScript+API/Vault

19. Obsidian Developer Docs: TypeScript API `FileManager.processFrontMatter`
https://docs.obsidian.md/Reference/TypeScript+API/FileManager/processFrontMatter

20. Product inspiration: Userdoc
https://userdoc.fyi/
