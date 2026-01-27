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
3. **Shows quick links** - Provides links to plan files

## Usage Examples

### Check Status

```
/plan-check-status --plan <plan-name>
```

This will:

- Show status summary
- Show next task if available
- Display quick links

If no plan is specified, you can use `limps list-plans` to see available plans first.

## Instructions for Claude

**When this command is invoked, you must:**

1. **Check plan status:**
   - If `--plan` provided: Use `limps status <plan-name>` to get status, then `limps next-task <plan-name>` to get next task
   - Otherwise: Ask user which plan to check, or use `limps list-plans` to show available plans

2. **Display the output:**
   - Show QUICK DECISION section
   - Show PLAN STATUS section
   - Show RECOMMENDED ACTIONS section
   - Display quick links

3. **Provide guidance:**
   - Explain what the status means
   - Suggest next actions based on status
   - Reference related commands

## When to Use

**Use `/plan-check-status` when:**

- You want to see plan status quickly
- You need a status overview without full details
- You want to check progress

**Use `limps next-task <plan-name>` instead when:**

- You want to get the next best task with scoring breakdown
- You need detailed task recommendations

**Use `limps status <plan-name>` instead when:**

- You need detailed plan status
- You want to see completion percentages and blocked agents

## Integration

This command provides a simple way to check plan status. Use `limps next-task <plan-name>` to get the next best task with detailed scoring.

## Example Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎯 QUICK DECISION: What should you do next?
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  → Ready to work: Run /run-agent <plan-name>
     (Next best task identified and ready)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 PLAN STATUS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Active Plan: 0004-feature-name

Status Summary:
  - 2 agents completed
  - 16 agents with work remaining

Next Best Task:
Agent: status & timing columns
Features: #1, #5, #6, #7
Status: 1 GAP, 0 WIP
Score: 78/100

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🎬 RECOMMENDED ACTIONS (in order)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  1. Run: /run-agent <plan-name> (start next task)
  2. Run: limps status <plan-name> (detailed status)
  3. Run: limps list-plans (view all plans)

Quick Links:
  {plan-name}-plan.md
  README.md
  interfaces.md
  gotchas.md
```

## Notes

- This command provides a focused view of plan status
- Simple status overview
- Good for quick status checks
- For detailed status, use `limps status <plan-name>`
