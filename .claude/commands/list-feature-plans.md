# List Feature Plans

List all available feature plans with their work types, names, and overviews.

## Instructions for Claude

**When this command is invoked, you must:**

1. **List plans using MCP tool:**
   - Use `list_plans` MCP tool (server: `limps`) to get all available plans
   - The tool returns structured data with plan number, name, work type, overview, and status

2. **Display the output:**
   - Show the formatted list of plans
   - Include work type (Refactor/Overhaul/Feature)
   - Include plan names
   - Show overviews if available
   - **Display file paths** for all files ({plan-name}-plan.md, README.md, interfaces.md, gotchas.md, and all agent files)

3. **Provide navigation help:**
   - Explain that paths are clickable in most modern terminals (Command+Click on macOS, Ctrl+Click on Linux/Windows)
   - Explain how to view a specific plan using the provided paths
   - Show how to access plan README files, interfaces, gotchas, and agent files
   - Reference the plan directory structure

## Output Format

The tool displays each plan with:

- Work type icon and label (Refactor, Overhaul, Feature)
- Plan name (human-readable)
- Overview snippet (if available from plan file)
- **File paths** (one per line):
  - `{plan-name}-plan.md` - Full feature specifications
  - `README.md` - Index and status (if exists)
  - `interfaces.md` - Interface contracts (if exists)
  - `gotchas.md` - Discovered issues (if exists)
  - All `*.agent.md` files in `agents/` directory (excludes completed agents in `agents/completed/` subdirectory)

## Example Output

```
Plans

0004-feature-name (Overhaul)
   Overview: Brief description of the plan...
   plans/0004-feature-name/0004-feature-name-plan.md
   plans/0004-feature-name/README.md
   plans/0004-feature-name/interfaces.md
   plans/0004-feature-name/gotchas.md
   plans/0004-feature-name/agents/000_agent_name.agent.md
   plans/0004-feature-name/agents/001_agent_name.agent.md
   ...

0005-another-feature (Refactor)
   Overview: Brief description...
   plans/0005-another-feature/0005-another-feature-plan.md
   plans/0005-another-feature/README.md
   plans/0005-another-feature/agents/000_agent_name.agent.md
   ...
```

## Viewing Plans

After listing, you can:

- **Click any file path** in the terminal to open it (Command+Click on macOS)
- Use `/run-agent <plan-name>` to start working on a plan
- Use `/plan-list-agents --plan <plan-name>` to see agents in detail

## Integration

This command is useful for:

- Discovering available plans before starting work
- Finding plans by work type
- Getting quick overviews of plan scope
- Navigating to specific plans for reference

**Note**: Completed agents (moved to `agents/completed/` directory) are automatically excluded from listings to show only active work.
