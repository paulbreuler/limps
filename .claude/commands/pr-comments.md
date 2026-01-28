# PR Comments (limps)

Fetch, summarize, and address GitHub PR comments using limps conventions.

## Instructions for Claude

**When this command is invoked, you must:**

1. **Resolve PR context:**
   - Identify current branch and PR (`gh pr view --json number,title,url,state`)
   - If no PR exists, explain and stop

2. **Fetch comments:**
   - Use `gh pr view <PR> --json reviewThreads,comments`
   - Group by file and thread

3. **Summarize feedback:**
   - List actionable items, ordered by severity
   - Include file paths and line references when available

4. **Propose fixes:**
   - For each item, state the intended change and impacted files
   - If plan/agent context exists, reference the agent file

5. **Apply fixes (if requested by user):**
   - Make code changes
   - Run targeted tests where applicable
   - Update PR with new commits

6. **Close the loop:**
   - Provide a checklist of resolved items
   - Offer to post replies via `gh pr comment` (only if user asks)

## Notes

- Keep replies concise and specific to limps codebase.
- Avoid references to external repos or tooling not present here.
