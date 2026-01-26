# Plan List Agents

List all agents in a plan with their status, features, and clickable links. Helps you find and select which specific agent to run.

## Invocation

```
/plan-list-agents --plan <plan-name>
```

## What This Command Does

1. **Lists all agents** - Shows all active agents in the plan (excludes completed/)
2. **Shows agent information**:
   - Agent number and display name
   - Features handled (#1, #2, #3)
   - Status summary (X PASS, Y WIP, Z GAP)
   - Clickable link to agent file
3. **Shows how to run** - Instructions for running a specific agent

## Usage Examples

### List Agents

```
/plan-list-agents --plan <plan-name>
```

This will:

- List all agents with status
- Show clickable links to agent files
- Display instructions for running specific agents

If no plan is specified, you can use `limps list-plans` to see available plans first.

## Instructions for Claude

**When this command is invoked, you must:**

1. **Run the list-agents command:**
   - If `--plan` provided: Use `limps list-agents <plan-name>` or limps MCP `list_agents` tool
   - Otherwise: Ask user which plan to list, or use `limps list-plans` to show available plans

2. **Display the output:**
   - Show the formatted list of agents
   - Include agent numbers, names, features, and status
   - Show clickable file links
   - Display instructions for running specific agents

3. **Provide guidance:**
   - Explain how to use the agent file links
   - Reference `/run-agent --agent [path]` for running a specific agent
   - Show how to copy agent file path

## When to Use

**Use `/plan-list-agents` when:**

- You want to see all available agents in a plan
- You want to choose which specific agent to run (not auto-select)
- You need to find an agent by name or features
- You want to see agent status at a glance

**Use `/run-agent <plan-name>` instead when:**

- You want to auto-select the next best agent
- You're ready to start working and don't care which agent

**Use `limps status <plan-name>` instead when:**

- You need detailed plan status
- You want to see completion percentages and blocked agents

## Integration

This command helps you find agents, then use `/run-agent --agent [agent-file-path]` to run a specific one.

**Workflow**:

1. `/plan-list-agents --plan <plan-name>` - See all agents
2. Click agent file link or copy path
3. `/run-agent --agent [agent-file-path]` - Run the specific agent

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📋 Agents in Plan: 0004-feature-name
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Agent 0: Accessibility Foundation Early
  Features: #1, #2
  Status: 2 PASS, 0 WIP, 0 GAP
  File: plans/0004-feature-name/agents/000_agent_accessibility_foundation_early.agent.md

Agent 1: Column Display Features
  Features: #3, #4, #5
  Status: 0 PASS, 1 WIP, 2 GAP
  File: plans/0004-feature-name/agents/001_agent_column_display_features.agent.md

Agent 2: Status & Timing Columns
  Features: #6, #7
  Status: 0 PASS, 0 WIP, 2 GAP
  File: plans/0004-feature-name/agents/002_agent_status__timing_columns.agent.md

  (3 agent(s) in completed/ directory)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

💡 To run a specific agent:
   /run-agent --agent [agent-file-path]
   Or click the agent file link above
```

## Notes

- Only shows active agents (excludes `completed/` directory)
- Agent files are clickable and open directly in Cursor
- Agent numbers come from filename prefix (`<NNN>_agent_` or `agent_<N>_` for backward compatibility)
- Agent files should use zero-padded 3-digit format (000, 001, 002, ...) for proper lexicographical ordering
- Status is parsed from agent file `**Status:**` markers
- Use this to find agents, then run with `/run-agent --agent [path]`
