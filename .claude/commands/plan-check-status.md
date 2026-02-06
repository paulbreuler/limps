# Plan Check Status

Simple entry point: "I want to check plan status". Shows plan status without overwhelming detail.

## Invocation

```
/plan-check-status
/plan-check-status --plan <plan-name>
```

## What This Command Does

1. **Shows status summary** - Displays completed vs active agents
2. **Shows next task** (if available) - Displays next best task
3. **Shows staleness report** - Flags stale agents or plans
4. **Shows quick links** - Provides links to plan files

## Usage Examples

### Check Status

```
/plan-check-status --plan <plan-name>
```

This will:

- Show status summary
- Show next task if available
- Show staleness warnings
- Display quick links

If no plan is specified, use `list_plans` MCP tool to see available plans first.

## Instructions for Claude

**When this command is invoked, you must:**

1. **Check plan status:**
   - If `--plan` provided: Use `get_plan_status` MCP tool (server: `limps`) to get status, then `get_next_task` MCP tool to get next task
   - Otherwise: Ask user which plan to check, or use `list_plans` MCP tool to show available plans

2. **Check staleness:**
   - Use `check_staleness` MCP tool (server: `limps`) for the plan to identify stale agents or plans
   - Include staleness warnings in the output

3. **Display the output:**
   - Show QUICK DECISION section
   - Show PLAN STATUS section (from `get_plan_status`)
   - Show STALENESS WARNINGS section (if any, from `check_staleness`)
   - Show RECOMMENDED ACTIONS section
   - Display quick links

4. **Provide guidance:**
   - Explain what the status means
   - Suggest next actions based on status
   - Reference related commands

## When to Use

**Use `/plan-check-status` when:**

- You want to see plan status quickly
- You need a status overview without full details
- You want to check progress

**Use `get_next_task` MCP tool instead when:**

- You want to get the next best task with scoring breakdown
- You need detailed task recommendations

**Use `get_plan_status` MCP tool instead when:**

- You need detailed plan status
- You want to see completion percentages and blocked agents

## Integration

This command provides a simple way to check plan status. Use `get_next_task` MCP tool to get the next best task with detailed scoring.

## Example Output

```
QUICK DECISION: What should you do next?

  -> Ready to work: Run /run-agent <plan-name>
     (Next best task identified and ready)

PLAN STATUS

Active Plan: 0004-feature-name

Status Summary:
  - 2 agents completed
  - 16 agents with work remaining

Next Best Task:
Agent: status & timing columns
Features: #1, #5, #6, #7
Status: 1 GAP, 0 WIP
Score: 78/100

STALENESS WARNINGS
  - Agent 003 last modified 14 days ago (threshold: 7 days)

RECOMMENDED ACTIONS (in order)

  1. Run: /run-agent <plan-name> (start next task)
  2. Run: get_plan_status MCP tool (detailed status)
  3. Run: list_plans MCP tool (view all plans)

Quick Links:
  {plan-name}-plan.md
  README.md
  interfaces.md
  gotchas.md
```

## Notes

- This command provides a focused view of plan status
- Includes staleness detection via `check_staleness` MCP tool
- Good for quick status checks
- For detailed status, use `get_plan_status` MCP tool
