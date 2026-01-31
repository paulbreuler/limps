# Close Feature Agent v2.0.0

Verify agent completion, sync status, and identify unblocked work.

## Invocation

```
/close-feature-agent [path-to-agent-file]
```

Example:

```
/close-feature-agent plans/0004-feature-name/agents/000_agent_name.agent.md
```

## What This Command Does

1. **Verify completion** - Check agent delivered what was promised
2. **Sync status** - Update README.md status matrix
3. **Report unblocked** - Show what can now proceed
4. **Capture gotchas** - Ensure discoveries are in gotchas.md

## What This Command Does NOT Do

- Regenerate other agent files (use `update-feature-plan`)
- Modify source code
- Merge PRs
- Assign next work

## Workflow

### Step 1: Parse Agent File

Read the agent's `.agent.md` using limps MCP `process_doc` tool and extract:

- Feature IDs and their status
- Exported interfaces claimed
- Files that should exist
- Gotchas section

### Step 2: Verify Completion

For each feature marked `PASS`:

**Check files exist**:

```
- [ ] src/components/Column/ColumnHeader.tsx exists
- [ ] src/components/Column/ColumnHeader.test.tsx exists
- [ ] src/components/Column/ColumnHeader.stories.tsx exists
```

**Check exports match interface** (spot check):

```
- [ ] useColumnHeader exports match declared signature
- [ ] ColumnHeader component exports match declared signature
```

**Check tests pass**:

```
- [ ] Run project test suite for affected files
```

### Step 3: Sync Status

Update `README.md` status matrix using limps MCP `update_doc` tool:

Before:

```
| 2 | Headers | Columns | 🔄 WIP | - |
| 3 | Resize | Columns | ❌ GAP | #2 |
```

After:

```
| 2 | Headers | Columns | ✅ PASS | - |
| 3 | Resize | Columns | ✅ PASS | - |
```

Update dependency graph colors if present.

### Step 4: Update Task Status

Use limps MCP `update_task_status` to mark features as PASS. Task status is stored in agent file frontmatter.

**Agent-only plans (no feature IDs):**

- If the agent file does not list feature IDs (e.g., only agent tasks), **skip `update_task_status`**.
- Add a note in the output that task status updates require feature IDs.

```markdown
## Newly Unblocked

| Feature             | Agent       | Was Blocked By | Status                   |
| ------------------- | ----------- | -------------- | ------------------------ |
| #5 Row Expand       | Rows        | #2 Headers     | Now GAP - ready to start |
| #7 Sort Integration | Integration | #4 Sorting     | Now GAP - ready to start |

**Next Steps**:

- Agent `rows.agent.md` can now proceed with #5
- Consider regenerating `rows.agent.md` if interfaces changed (use `update-plan`)
```

### Step 5: Gotchas Check

Verify any gotchas discovered during implementation are in `gotchas.md`:

```markdown
## Gotchas Sync

Found in agent file but NOT in gotchas.md:

- "ResizeObserver no-op in Storybook" - adding to gotchas.md

All gotchas synced ✓
```

## Output Format

The output should be clean, readable text with minimal markdown formatting. Use plain text sections, not markdown headers. Structure:

```
Agent Close Report: columns.agent.md

Verification

Feature    Status  Files   Exports  Tests
#2 Headers  PASS    4/4     match    pass
#3 Resize   PASS    4/4     match    pass
#4 Sorting  PASS    4/4     match    pass

Status Synced

interfaces.md updated:
- #2: WIP → PASS
- #3: GAP → PASS
- #4: GAP → PASS

Unblocked

Feature             Agent       Action
#5 Row Expand       rows        Ready to start
#7 Sort Integration integration Ready to start

Gotchas

- No gotchas found

Next Steps

- Agent work complete
- Dependent agents can now proceed
- Run `limps status <plan-name>` to assess overall plan status
- Run `limps next-task <plan-name>` to get next task
```

**Critical Formatting Rules:**

- DO NOT use markdown headers (#, ##, ###) - they render as all caps/giant headers
- Use plain text section titles (no # symbols)
- Use simple spacing between sections (blank lines)
- Keep tables simple (spaced columns, not markdown table syntax if it causes issues)
- Use bullet points (-) not numbered lists unless sequence is critical
- Avoid emoji in section titles
- Keep content concise and scannable

````

## Failure Cases

### Feature Not Complete

```markdown
## Verification FAILED

| Feature    | Status | Issue                                                    |
| ---------- | ------ | -------------------------------------------------------- |
| #3 Resize  | ❌     | Missing: ResizeHandle.stories.tsx                        |
| #4 Sorting | ❌     | Export mismatch: toggle() returns void, declared boolean |

**Action**: Agent must fix issues before close
````

### Tests Failing

```markdown
## Verification FAILED

| Feature    | Tests | Issue                                    |
| ---------- | ----- | ---------------------------------------- |
| #2 Headers | ❌    | 2 tests failing in ColumnHeader.test.tsx |

**Action**: Agent must fix tests before close
```

## Integration with Plan Lifecycle

```
create-feature-plan
    ↓
[agent implements]
    ↓
close-feature-agent  ←── YOU ARE HERE
    ↓
[if interfaces changed] → update-feature-plan → regenerate affected agents
    ↓
limps next-task (get next task)
    ↓
run-agent (start next task)
    ↓
[next agent implements]
    ↓
close-feature-agent
    ↓
[repeat until done]
```

## After Closing

After closing an agent, use these commands to continue work:

1. **Assess overall plan status**: Run `limps status <plan-name>` to assess all agent statuses
2. **Get next task**: Use `limps next-task <plan-name>` to get the next best task
3. **Start next task**: Use `/run-agent <plan-name>` to start the next task

### Recommended Post-Close Workflow

```
1. Close agent: /close-feature-agent [agent-path]
2. Get next task: `limps next-task <plan-name>`
3. Start next task: /run-agent <plan-name>
```

## Command Flags

```
/close-feature-agent [path] --skip-tests    # Skip test verification (use with caution)
/close-feature-agent [path] --dry-run       # Report only, don't update files
/close-feature-agent [path] --force         # Close even with warnings
```

## Checklist Mode

If you prefer manual verification, use checklist mode:

```
/close-feature-agent [path] --checklist
```

Outputs a checklist you can work through:

```markdown
## Agent Close Checklist: columns.agent.md

### Feature #2: Headers

- [ ] Files exist: ColumnHeader.tsx, .test.tsx, .stories.tsx, useColumnHeader.ts
- [ ] Exports match: `useColumnHeader(id: string): {...}`
- [ ] Exports match: `ColumnHeader: FC<{columnId: string}>`
- [ ] Tests pass: Run project test suite
- [ ] Status in agent file: PASS

### Feature #3: Resize

[same structure...]

### Sync

- [ ] Update README.md status matrix
- [ ] Update dependency graph colors
- [ ] Check gotchas.md is current

### Unblocked

- [ ] Notify/assign agent for #5 Row Expand
- [ ] Consider update-feature-plan if interfaces evolved
```
