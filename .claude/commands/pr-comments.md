# PR Comments

Fetch, review, address, and resolve **unresolved** PR review comments using the `scripts/helpers/pr-comments.ts` helper.

## Instructions for Claude

When this command is invoked:

1. **List unresolved threads**: Use `npx tsx scripts/helpers/pr-comments.ts list [pr_number]`
   - Shows thread IDs, file paths, comments, and comment IDs
   - Optionally specify PR number, or omit to use current branch's PR
2. **Analyze by file**: Use `npx tsx scripts/helpers/pr-comments.ts analyze [pr_number]`
   - Groups threads by file path
   - Shows which files exist vs. deleted
   - Helps prioritize which comments to address
3. **Address comments**:
   - **Before fixing**: For architecture/maintainability concerns, run `/branch-code-review` to understand impact
   - **Before fixing**: For security/MCP concerns, run `/mcp-code-review` to identify risks
   - **After fixing**: If fixes were made, commit using conventional commits (use `/git-commit-best-practices`)
   - **Commit message**: Reference the comment/concern: `fix(component): address review feedback on error handling`
4. **Reply to comments**: Use `npx tsx scripts/helpers/pr-comments.ts reply [pr_number] <comment_id> <message>`
   - See reply templates below for common responses
5. **Resolve threads**: Use `npx tsx scripts/helpers/pr-comments.ts resolve <thread_id>`
   - Only after addressing and committing fixes (or explaining why no fix needed)

## Quick Start

```bash
# List all unresolved threads on current PR
npx tsx scripts/helpers/pr-comments.ts list

# Analyze threads by file
npx tsx scripts/helpers/pr-comments.ts analyze

# Reply to a specific comment
npx tsx scripts/helpers/pr-comments.ts reply <comment_id> "Your reply message here"

# Resolve a thread after addressing
npx tsx scripts/helpers/pr-comments.ts resolve <thread_id>
```

## Helper Script Commands

### list [pr_number]
Lists all unresolved review threads with their comments.

```bash
npx tsx scripts/helpers/pr-comments.ts list
```

**Output format:**
```
Thread: PRRT_kwDOAbCdEf12345
Path:   src/file.ts
  [reviewer]: Comment text here (ID: 123456)
---
```

### analyze [pr_number]
Analyzes unresolved threads grouped by file path, showing which files exist vs. deleted.

```bash
npx tsx scripts/helpers/pr-comments.ts analyze
```

**Output format:**
```
Unresolved threads by file:
   3 threads in [EXISTS]   src/file1.ts
   2 threads in [DELETED]  src/removed.ts
   1 threads in [EXISTS]   src/file2.ts
```

### reply [pr_number] <comment_id> <message>
Replies to a specific comment.

```bash
npx tsx scripts/helpers/pr-comments.ts reply 123456 "Fixed in latest commit"
```

### resolve <thread_id>
Resolves a review thread.

```bash
npx tsx scripts/helpers/pr-comments.ts resolve PRRT_kwDOAbCdEf12345
```

## Workflow

### 1. Analyze Unresolved Comments

Start by getting an overview of what needs to be addressed:

```bash
# See all unresolved threads grouped by file
npx tsx scripts/helpers/pr-comments.ts analyze

# Get detailed view of each thread and comment
npx tsx scripts/helpers/pr-comments.ts list
```

The analyze command shows which files still exist vs. deleted, helping you prioritize.

### 2. Address Each Comment

For each comment identified in step 1:

**If the file was deleted:**
```bash
npx tsx scripts/helpers/pr-comments.ts reply <comment_id> "This file has been removed in subsequent commits."
```

**If you need to make code changes:**
1. Run `/branch-code-review` (for architecture/maintainability) or `/mcp-code-review` (for security/MCP concerns)
2. Make the necessary fixes
3. Commit using conventional commits (see `/git-commit-best-practices`)
4. Reply to the comment:
```bash
npx tsx scripts/helpers/pr-comments.ts reply <comment_id> "Fixed in [commit description]"
```

**If no fix is needed:**
```bash
npx tsx scripts/helpers/pr-comments.ts reply <comment_id> "This is intentional because [reason]"
```

### 3. Resolve Threads

After replying to all comments in a thread:

```bash
npx tsx scripts/helpers/pr-comments.ts resolve <thread_id>
```

**Batch resolving** (if you've addressed multiple threads):
```bash
# Resolve multiple threads
for thread_id in PRRT_xxx PRRT_yyy PRRT_zzz; do
  npx tsx scripts/helpers/pr-comments.ts resolve $thread_id
done
```

## Reply Templates

**Deleted file:**

> This file has been removed. [Brief explanation of why/what replaced it.]

**Addressed in code:**

> Fixed in [commit/change description].

**Won't fix (with explanation):**

> This is intentional because [reason]. [Additional context if needed.]

**Test/infrastructure code:**

> This is test infrastructure. Tests are passing - if issues arise, we can enhance then.

**Outdated comment:**

> This has been addressed in subsequent commits. [Brief explanation of current state.]

## Notes

- Always reply before resolving so reviewers understand why
- Group similar comments and batch process them
- Check if files still exist before addressing implementation concerns
- Use `--silent` flag when batch processing to reduce noise
- **Commit fixes**: When addressing comments with code changes, use conventional commits (see `/git-commit-best-practices`)
- **Breaking changes**: If comment addresses breaking change concerns, ensure `BREAKING CHANGE:` footer is in commit message
