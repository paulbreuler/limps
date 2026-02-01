---
name: limps-planning
description: Guide for using limps MCP tools to plan, track, and update work across plans and agents.
argument-hint: "[plan | task | docs]"
---
# limps planning

## Purpose

Provide consistent guidance for selecting limps MCP tools in common planning workflows.

## When to Use

- Creating or updating plans and agents
- Finding the next task or plan status
- Searching or updating documents in a plans directory

## Quick Tool Selection

- **Create a plan**: `create_plan`, then `create_doc` for plan files
- **List plans**: `list_plans`
- **List agents**: `list_agents`
- **Plan status**: `get_plan_status`
- **Next task**: `get_next_task`
- **Search docs**: `search_docs`
- **Update status**: `update_task_status`
- **Read/process docs**: `process_doc`, `process_docs`

## Examples

### Find the next task in a plan

1. `list_plans` → pick plan name
2. `get_next_task` with plan number/name

### Update an agent status

1. `list_agents` for the plan
2. `update_task_status` with task ID and new status

### Extract open features across plans

1. `process_docs` with pattern `plans/*/*-plan.md`
2. Use `extractFeatures()` to filter `GAP`

## Notes

- Paths should be relative to the configured `plansPath` or `docsPaths`.
- Use `process_doc(s)` for structured extraction instead of manual parsing.
