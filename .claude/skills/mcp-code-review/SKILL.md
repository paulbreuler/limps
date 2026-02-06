---
name: mcp-code-review
description: Review code for correctness, security, and LLM/MCP safety in this repo. Use when a code review, security review, or MCP/LLM audit is requested.
---
# MCP + LLM Code Review (limps)

## Purpose
Perform a security-focused, test-minded code review with emphasis on MCP servers, LLM safety, and performance risks in this repository.

## Scope
Use `$ARGUMENTS` as the scope (paths, diff range, PR number, or component name). If no scope is provided, review the current git diff.

## Workflow
1. **Establish context**
   - Read `CLAUDE.md` and relevant package docs.
   - Identify the target package (`packages/limps` or `packages/limps-headless`).
2. **Threat intel + dependency hygiene**
   - Search authoritative sources for new MCP/LLM or supply-chain issues:
     - OWASP LLM Top 10, OWASP API Top 10, npm advisories, GitHub Security Advisories.
   - Audit npm dependencies (use repo scripts when available):
     - `npm audit --workspaces --include=prod`
     - `npm audit --workspaces --omit=dev` (if prod-only is needed)
   - Check for outdated or abandoned packages:
     - `npm outdated --workspaces`
   - Inspect dependency tree for suspicious packages or name lookalikes:
     - `npm ls --all --workspaces`
   - Verify lockfile integrity expectations:
     - Prefer `npm ci` for clean installs (verifies `package-lock.json` integrity).
3. **Enumerate change surface**
   - List changed files and inspect diffs before diving into code.
3. **Security-first review**
   - Validate input handling, path safety, and external command usage.
   - Check for secret exposure (logs, errors, telemetry).
4. **MCP/LLM safety review**
   - Review tool schemas, argument validation, and permission boundaries.
   - Identify prompt injection vectors and untrusted content handling.
5. **Correctness and reliability**
   - Look for logic errors, race conditions, and edge cases.
6. **Performance and cost**
   - Identify expensive operations, redundant work, or unbounded processing.
7. **Tests**
   - Confirm coverage for new behavior and regression risk areas.

## Repo-Specific Risk Areas
Focus extra scrutiny on:
- `packages/limps/src/server.ts`, `src/tools/*`, `src/resources/*` (MCP tool/resource behavior)
- `packages/limps/src/rlm/*` and `process_doc(s)` tools (untrusted code execution)
- `packages/limps/src/indexer.ts` and `src/watcher.ts` (filesystem and database safety)
- `packages/limps-headless/src/tools/*` (external fetchers, parsing, extraction)

## MCP/LLM Security Checklist
- Validate tool inputs and guard file paths against traversal.
- Avoid executing untrusted code or shell commands without sandboxing.
- Ensure user-controlled content never becomes tool arguments without sanitization.
- Check for prompt injection via markdown, frontmatter, or external content.
- Confirm tools/resources do not leak secrets or local paths.
- Verify allowed-tools / permissions are least-privilege.
- Verify dependency integrity to reduce supply-chain risk:
  - Prefer `npm ci` and check lockfile integrity hashes.
  - Flag suspicious name lookalikes or unexpected transitive packages.

## Output Format
Follow the repo review style:
- Findings first, ordered by severity.
- Include file references and concrete evidence.
- If no issues, say so explicitly and list residual risks or testing gaps.

Use this structure:
```
## Findings
- 🔴 Critical: ...
- 🟠 High: ...
- 🟡 Medium: ...
- 🟢 Low: ...

## Questions / Assumptions
- ...

## Tests
- Suggested: ...
```

## Graph & Multi-Operation Tool Patterns
When reviewing MCP tools, check:
- **Unified tool pattern**: Multi-operation tools (like `graph` with subcommands: health, search, trace, check, suggest, reindex) should validate the `operation` parameter and dispatch correctly.
- **Graph DB error handling**: Tools that use `better-sqlite3` must handle DB open failures, missing tables, and corrupt data gracefully.
- **Input validation**: All MCP tool schemas should validate inputs before processing. Check for path traversal, SQL injection in FTS queries, and oversized inputs.

## Notes
- Prefer `ReadFile`, `Grep`, `Glob` over shell tools for code inspection.
- Avoid speculative claims; cite code or call out uncertainty.
