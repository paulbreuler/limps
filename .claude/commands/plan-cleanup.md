# Plan Cleanup

Simple entry point: "I want to clean up completed agents". Moves completed agents to `completed/` directory.

## Invocation

```
/plan-cleanup --plan <plan-name>
```

## What This Command Does

1. **Finds completed agents** - Identifies agents with all features PASS using `limps status`
2. **Shows what will be cleaned up** - Lists agents to be moved
3. **Moves to completed/** - Moves completed agents to `agents/completed/` directory

## Usage Examples

### Cleanup Plan

```
/plan-cleanup --plan <plan-name>
```

This will:

- Find completed agents using `limps status <plan-name>`
- Show what will be moved
- Ask for confirmation (unless `--yes` flag used)
- Move agents to `agents/completed/` directory

### Auto-Confirm

```
/plan-cleanup --yes
```

Skips confirmation prompt and automatically moves completed agents.

## Instructions for Claude

**When this command is invoked, you must:**

1. **Check plan status:**
   - Use `limps status <plan-name>` to identify completed agents
   - Or use limps MCP `get_plan_status` tool to get plan status
   - Identify agents where all features are marked PASS

2. **Identify completed agents:**
   - Use `limps list-agents <plan-name>` or limps MCP `list_agents` tool
   - Filter for agents with all features PASS
   - List agent files to be moved

3. **Move completed agents:**
   - Use file system operations to move agent files from `agents/` to `agents/completed/`
   - Or use limps MCP tools if available for file operations
   - Show confirmation prompt (unless `--yes` used)

4. **Display the output:**
   - Show what was cleaned up
   - Show results after cleanup

5. **Provide guidance:**
   - Explain what was moved
   - Suggest running `limps status <plan-name>` to reassess status
   - Reference `/run-agent` to start next task

## When to Use

**Use `/plan-cleanup` when:**

- You know cleanup is needed
- You want to clean up before starting work
- You want a simple, focused command

**Use `limps next-task <plan-name>` instead when:**

- You want to see overall plan status first
- You're unsure if cleanup is needed
- You want to see next task recommendations

## Integration

This command helps keep the active agents directory clean by moving completed agents. Use `limps status <plan-name>` first to see which agents are completed.

## Example Output

```
Plan Cleanup: 0004-feature-name

Completed Agents Found:
  1. 000_agent_accessibility_foundation_early.agent.md
  2. 001_agent_column_display_features.agent.md

Move to completed/ directory? (y/n)
y

✓ Moved 000_agent_accessibility_foundation_early.agent.md to completed/
✓ Moved 001_agent_column_display_features.agent.md to completed/
✓ Moved 2 agent(s) to completed/
```

## Notes

- Completed agents are identified by having all features marked PASS
- Agents are moved to `agents/completed/` directory
- This helps keep the active agents directory clean
- After cleanup, run `limps next-task <plan-name>` to get next task recommendations
- Use `limps status <plan-name>` to identify which agents are completed
