# PR Check and Fix (limps)

Triage failing PR checks and apply fixes using limps workflows and scripts only.

## Instructions for Claude

**When this command is invoked, you must:**

1. **Resolve PR context:**
   - `gh pr view --json number,title,url,headRefName,baseRefName,statusCheckRollup`
   - If no PR exists, report and stop

2. **Summarize check status:**
   - List failed checks with URLs
   - Separate by category: format, lint, type-check, build, test

3. **Reproduce locally:**
   - Run the minimal failing command first
   - Use repo scripts only:
     - Root: `npm run format:check`, `npm run lint`, `npm run type-check`, `npm run build`, `npm test`
     - Workspaces: `npm test --workspace <name>` etc.

4. **Fix iteratively:**
   - Apply code changes narrowly
   - Re-run the failing command
   - Then run full validation: `npm test` (or `npm run validate` if requested)

5. **Commit and push fixes:**
   - Use conventional commits
   - Push branch and re-check PR status

## Notes

- Do not call scripts or tools from other repos.
- Prefer limps MCP tools for plan/agent context when relevant.
