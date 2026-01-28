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

5. **Optional: Run code reviews after fixes:**
   - **When to review**: Run reviews if fixes involve:
     - Security-related changes (always review with `/mcp-code-review`)
     - Architecture changes (multiple files, new patterns)
     - Complex logic changes (not just formatting/linting)
     - Changes to MCP tools/resources or RLM sandbox
   - **Review timing**: After all fixes are complete, before final commit
   - Invoke `/branch-code-review` for architecture/maintainability concerns
   - Invoke `/mcp-code-review` for security/MCP/LLM concerns
   - If reviews find new issues, fix them before committing

6. **Commit and push fixes:**
   - **Commit message format**: Use conventional commits, reference the failing check:
     - `fix(ci): resolve linting errors in server.ts`
     - `fix(test): update test assertions for new API`
     - `fix(format): apply prettier formatting`
   - Use `/git-commit-best-practices` for detailed commit message guidance
   - **Commit scope**: Reference the package/component that was fixed
   - Push branch: `git push` (force push only if rebased: `git push --force-with-lease`)
   - Re-check PR status: `gh pr checks` or view PR in browser

## Notes

- Do not call scripts or tools from other repos.
- Prefer limps MCP tools for plan/agent context when relevant.
- **Edge cases**:
  - If fixes introduce new failures, address them iteratively
  - If fixes require breaking changes, document in commit message with `BREAKING CHANGE:` footer
  - If multiple unrelated fixes, consider separate commits (use `/git-commit-best-practices` for guidance)
- **Force push safety**: Only use `--force-with-lease` if rebasing; never force push to shared branches
