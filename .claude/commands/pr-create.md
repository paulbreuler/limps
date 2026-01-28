# Pull Request Creation (limps)

Create a PR on GitHub with a limps-aware description based on staged changes or recent commits.

## Instructions for Claude

**When this command is invoked, you must:**

1. **Check prerequisites:**
   - Verify current branch is not `main`
   - Check if branch is pushed (`git push --dry-run`)
   - Verify GitHub CLI is available (`gh --version`)
   - Check if PR already exists (`gh pr view`)

2. **Detect plan/agent context (if applicable):**
   - Use limps MCP tools when available:
     - `list_plans`, `list_agents`, `get_plan_status`, `process_doc`
   - If a plan is inferred (via modified files under `plans/` or commit messages), locate the agent file and extract:
     - Agent title, status, and feature list from frontmatter/sections
   - If no plan/agent is detected, proceed as a standard PR.

3. **Analyze git changes:**
   - Base branch: `main` (unless user specifies)
   - Use `git log main..HEAD` and `git diff --stat main..HEAD`
   - Summarize key files and modules touched

4. **Generate PR description (in memory only):**
   - Summary
   - Changes (bulleted, by subsystem)
   - Tests run (from CLI output or inferred)
   - Risks/notes (breaking changes, data migrations)
   - Related plan/agent (if detected), including plan name + agent file path

5. **Create PR via GitHub CLI:**
   - Push branch if needed (`git push -u origin <branch>`)
   - Use `gh pr create` with title and body
   - Title format:
     - With agent: `feat(limps-radix): <agent-title>`
     - Without agent: conventional commit title inferred from changes

6. **Error handling:**
   - If PR exists, show URL and stop
   - If `gh` missing, show install/auth instructions
   - If no changes, report and stop

**Do not create any files.** Generate PR body in memory and pass to `gh pr create`.

## PR Description Template

```markdown
## Summary
- ...

## Changes
- ...

## Tests
- ...

## Notes / Risks
- ...

## Plan / Agent (if applicable)
- Plan: <plan-name>
- Agent: <agent-title> (<agent-file>)
```

## Usage

```
/pr
/pr --base main
/pr --commits HEAD~3..HEAD
```
