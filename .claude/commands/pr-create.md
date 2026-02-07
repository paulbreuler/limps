# Pull Request Creation (limps)

Create a PR on GitHub with a limps-aware description based on staged changes or recent commits.

## Instructions for Claude

**When this command is invoked, you must:**

1. **Check prerequisites:**
   - Verify current branch is not `main`
   - Check if branch is pushed (`git push --dry-run`)
   - Verify GitHub CLI is available (`gh --version`)
   - Check if PR already exists (`gh pr view`)

2. **Optional: Run code reviews (recommended before PR creation):**
   - **Review order**: Run reviews in parallel if possible, or sequentially (branch review first, then MCP review)
   - For general code review: Invoke `/branch-code-review` skill to review architecture, maintainability, and correctness
   - For MCP/LLM security review: Invoke `/mcp-code-review` skill to review security, MCP safety, and LLM-related concerns
   - **Timing**: Run reviews after analyzing git changes (step 4) to have full context
   - Include review findings in PR description if issues are found (or note that reviews passed)

3. **Detect plan/agent context (if applicable):**
   - Use limps MCP tools when available:
     - `list_plans`, `list_agents`, `get_plan_status`, `process_doc`
   - If a plan is inferred (via modified files under `plans/` or commit messages), locate the agent file and extract:
     - Agent title, status, and feature list from frontmatter/sections
   - If no plan/agent is detected, proceed as a standard PR.

4. **Analyze git changes:**
   - **Detect base branch**: 
     - If user specifies base (e.g., `--base develop`), use that
     - Otherwise, detect default: `git symbolic-ref refs/remotes/origin/HEAD` → extract branch name
     - Fallback: try `origin/main`, then `origin/master`
     - If no base branch found, ask user or default to `main`
   - Use `git log <base>..HEAD` and `git diff --stat <base>..HEAD`
   - **Edge case**: If no commits exist (only staged changes), analyze `git diff --cached` instead
   - Summarize key files and modules touched

5. **Optional: Review commit messages (recommended):**
   - Review commits: `git log --format="%H%n%s%n%b%n---" main..HEAD`
   - Invoke `/git-commit-best-practices review-commits` to validate commit message quality
   - Check for conventional commit format, atomic commits, and clear messages
   - **If issues found**: Present findings and ask user if they want to:
     - Amend commits before creating PR (recommended), OR
     - Proceed with PR creation anyway (issues will be noted in PR description)
   - **Detect breaking changes**: Search commit messages for `BREAKING CHANGE:` footer:
     - `git log --format=%B main..HEAD | grep -i "BREAKING CHANGE"` or parse commit bodies
     - Extract breaking change descriptions for PR description

6. **Generate PR description (in memory only):**
   - Summary
   - Changes (bulleted, by subsystem)
   - Tests run (from CLI output or inferred)
   - Risks/notes (breaking changes, data migrations)
   - Code review status (if reviews were run)
   - Related plan/agent (if detected), including plan name + agent file path

7. **Create PR via GitHub CLI:**
   - Push branch if needed (`git push -u origin <branch>`)
   - Use `gh pr create` with title and body
   - **PR Title format** (follow conventional commits):
     - **Note**: PR title summarizes the entire PR (may have multiple commits)
     - With agent: `feat(limps-headless): <agent-title>` (or appropriate type based on overall PR)
     - Without agent: `<type>(<scope>): <subject>` inferred from all changes
     - Use imperative mood, lowercase (except proper nouns), no period
     - Include scope (package/component) when appropriate
     - Keep under 72 characters if possible
     - **Type selection**: Use the most significant change type (precedence: feat > fix > refactor > perf > docs > style > test > chore)
     - **Multiple types**: If PR has both feat and fix, use `feat` (features are more significant)
   - **Title examples:**
     - `feat(limps): add config migration utility` (even if PR has multiple commits)
     - `fix(server): handle missing config gracefully`
     - `refactor(limps-headless): simplify extension loader`

8. **Open PR in browser:**
   - After successful creation, open the PR in the browser using `gh pr view --web`

9. **Error handling:**
   - If PR exists, show URL and stop
   - If `gh` missing, show install/auth instructions
   - If no changes, report and stop

**Do not create any files.** Generate PR body in memory and pass to `gh pr create`.

## Commit Message Best Practices

When analyzing commits, use `/git-commit-best-practices` skill for detailed guidance. Key points:
- Commits should follow conventional commit format: `<type>(<scope>): <subject>`
- PR title summarizes the entire PR (may differ from individual commit messages)
- Breaking changes should be in commit footers: `BREAKING CHANGE: <description>`
- For detailed commit message guidance, invoke `/git-commit-best-practices`

## PR Description Template

```markdown
## Summary
- ...

## Changes
- ...

## Tests
- ...

## Code Review
- General review: [✅ Passed | ⚠️ Issues found | Not run]
- MCP/LLM review: [✅ Passed | ⚠️ Issues found | Not run]
- Commit review: [✅ Passed | ⚠️ Issues found | Not run]
- [Include any critical findings from reviews]

## Breaking Changes
- [If any commits contain `BREAKING CHANGE:` footer, extract and list them here]
- [Describe migration path if applicable]
- [Reference migration guide or docs if available]

## Notes / Risks
- ...

## Plan / Agent (if applicable)
- Plan: <plan-name>
- Agent: <agent-title> (<agent-file>)
```

## Usage

```
/pr-create
/pr-create --base main
/pr-create --commits HEAD~3..HEAD
```
