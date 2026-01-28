---
name: branch-code-review
description: Review changes on the current branch versus main for design, maintainability, and correctness. Use when a general code review is requested.
argument-hint: "[scope | base..head]"
allowed-tools: Bash(git *), Read, Grep, Glob
---
# Branch Code Review (General)

## Purpose
Perform a general code review on the current branch compared to the base branch (`main` by default), focusing on architecture, maintainability, and correctness.

## Scope
- If `$ARGUMENTS` is provided, treat it as a scope (paths, diff range, or PR number).
- If no arguments are provided, review `base...HEAD` where `base` is detected (`origin/main` → `origin/master` fallback).

## Workflow
1. **Determine diff target**
   - Detect base branch:
     - `git symbolic-ref refs/remotes/origin/HEAD` → extract `main` or `master`.
     - If not available, try `origin/main`, then `origin/master`.
2. **Enumerate change surface**
   - `git diff --name-status base...HEAD`
   - `git log --oneline base...HEAD`
   - Read the diff before diving into code.
3. **Architecture pass**
   - Evaluate loose coupling, high cohesion, extensibility, and DRY.
   - Check module boundaries and whether responsibilities are clearly separated.
4. **Maintainability pass**
   - Keep files under ~500 lines unless necessary.
   - Names are descriptive; public names are concise; internal names can be verbose.
   - Comments explain *why* for non-obvious logic; remove redundant comments.
   - Documentation is updated for behavior, usage, or interface changes.
5. **Correctness and safety**
   - Validate logic, edge cases, and error handling.
   - Look for regressions, config mismatches, or hidden coupling.
6. **Tests**
   - Ensure tests exist and are meaningful for the change surface.
   - Prefer tests that would fail on broken behavior.

## Best-Practice Signals (from authoritative guidance)
- Review design and interactions first; validate overall intent. (Google Eng Practices)
- Read every changed line in logical sequence; expand context if needed. (Google + Microsoft)
- Focus on correctness, readability/maintainability, and test quality. (Microsoft)
- Use structured checklists to avoid missing issues. (Atlassian)

## Repo-Specific Context
This repo is evolving toward extensible planning/content management. Favor:
- Clear interfaces for future content types beyond plans.
- Minimal cross-package coupling.
- Extensible, composable APIs (avoid one-off branching).
- Config/format stability to support long-lived plans and migrations.

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
