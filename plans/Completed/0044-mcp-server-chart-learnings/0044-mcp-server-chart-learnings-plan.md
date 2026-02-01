# Plan 0044: MCP Server Chart Learnings

## Summary
Apply learnings from https://github.com/antvis/mcp-server-chart to improve limps documentation, configurability, and skills packaging. Focus is on user-facing clarity (README structure, CLI/ENV docs), optional tool filtering, and a published planning skill for AI IDEs. No transport or Docker implementation in this plan—only documentation and scaffolding.

## Work Type
features

## Goals
- Make limps README as discoverable as mcp-server-chart (TOC, features list, CLI options, env vars table).
- Add optional tool filtering (allow/deny list) to reduce MCP surface area.
- Package and document a “limps planning skill” for AI IDEs.
- Document transport options/roadmap for SSE/HTTP as a future-facing section.

## Non‑Goals
- Implement SSE/HTTP transport.
- Add Docker packaging.
- Change core tool behavior beyond filtering.

## References
- https://github.com/antvis/mcp-server-chart (README structure, tool filtering, skill packaging, multi-transport docs)
- limps README and CLI tooling

## Feature List

### #1 README & Docs Parity
**TL;DR**: Add a table of contents, feature highlights, CLI options, and environment variable table. Include Windows config snippets and a “skills” section with install instructions.

**User value**: Faster onboarding, fewer setup mistakes, clearer feature discovery.

#### Gherkin
- **Scenario:** New user finds setup instructions quickly
  - Given I open the README
  - When I scan the table of contents
  - Then I can jump to Setup, CLI, Config, and MCP Tools

- **Scenario:** User sees available tools and limits
  - Given the Features section is present
  - When I read the tool list
  - Then I understand the capabilities and boundaries

- **Scenario:** Windows user configures MCP correctly
  - Given I’m on Windows
  - When I read the setup snippets
  - Then I can copy a Windows-specific `cmd /c` config

#### TDD Cycle (Docs)
1. `README includes table of contents` → update README → verify section anchors
2. `README includes env var table` → add env vars → verify values
3. `README includes windows setup` → add snippets → verify parity with mac

#### Files
- `README.md`
- `packages/limps-headless/README.md` (if mirroring sections)
- `.claude/commands` (if cross-linking skills)

---

### #2 Tool Filtering (Allow/Deny List)
**TL;DR**: Add config/env-based tool filtering to limit what tools the MCP server exposes.

**User value**: Reduce tool surface area (security & compatibility), mirror `DISABLED_TOOLS` concept.

#### Gherkin
- **Scenario:** Disable a tool by name
  - Given I set `LIMPS_DISABLED_TOOLS="process_doc,process_docs"`
  - When the server starts
  - Then those tools are not registered

- **Scenario:** Allowlist only tools
  - Given I set `LIMPS_ALLOWED_TOOLS="list_docs,search_docs"`
  - When the server starts
  - Then only those tools are registered

- **Scenario:** Unknown tool names are ignored
  - Given the allow/deny list contains unknown tools
  - When the server starts
  - Then it logs a warning but does not crash

#### TDD Cycle
1. `filters tools via allowlist` → implement filter → add tests
2. `filters tools via denylist` → implement filter → add tests
3. `unknown tools warned and ignored` → log + test

#### Files
- `packages/limps/src/tools/index.ts`
- `packages/limps/src/config.ts`
- `packages/limps/src/types.ts` (config typing)
- `packages/limps/tests` (new test coverage)
- `README.md` (doc)

---

### #3 Publish limps planning skill
**TL;DR**: Provide a packaged skill that teaches IDEs how to choose limps tools and flows.

**User value**: More consistent tool usage across Cursor/Claude/Codex.

#### Gherkin
- **Scenario:** User installs skill via npx
  - Given I run `npx skills add <limps-skill-repo>`
  - When the installation completes
  - Then I can invoke a “limps planning” skill from the IDE

- **Scenario:** Skill guides tool selection
  - Given I ask for “next task”
  - When the skill runs
  - Then it chooses `get_next_task` with correct inputs

#### TDD Cycle
1. `skill repo structure is valid` → create package → validate metadata
2. `skill docs referenced in README` → add docs → verify link

#### Files
- `skills/limps-planning` (or new package dir)
- `README.md` (skill install section)
- `.claude/skills` (if reusing internal skill content)

---

### #4 Transport & Deployment Docs (Roadmap)
**TL;DR**: Document current stdio transport and outline future SSE/HTTP support.

**User value**: Sets expectations for remote clients (ChatGPT, hosted use).

#### Gherkin
- **Scenario:** ChatGPT user understands limits
  - Given I read the transport section
  - When I configure ChatGPT
  - Then I understand current requirement for a proxy

#### TDD Cycle (Docs)
1. `transport section explains stdio` → add doc → verify clarity
2. `future transports documented` → add roadmap → verify disclaimers

#### Files
- `README.md`

## Architecture / Design Notes
- Tool filtering should be applied in `tools/index.ts` right before registration.
- Env var precedence: explicit config > env var defaults.
- Keep lists case-sensitive to tool names (match registry keys).
- Skills packaging should be externalizable without requiring monorepo tooling.

## Testing Strategy
- Unit tests for tool filtering (allowlist/denylist + unknown tool names).
- Documentation checks: verify README sections and links.

## Risks / Gotchas
- Tool names mismatch between docs and registry keys.
- Over-filtering could hide required tools for CLI flows.

## Milestones
- M1: Docs improvements (#1, #4)
- M2: Tool filtering (#2)
- M3: Skill packaging (#3)
