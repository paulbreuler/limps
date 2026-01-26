# Run Agent

Select the next best agent task from a plan and open it in Cursor, or run a specific agent file.

## Invocation

```
/run-agent [plan-name]
/run-agent --agent [agent-path]
/run-agent --assess [plan-name]
```

## What This Command Does

1. **Selects next best task** (if plan name provided) - Uses scoring algorithm based on:
   - Dependencies (40%): Features with all dependencies PASS get highest score
   - Workload balance (30%): Agents with fewer remaining tasks get higher score
   - Priority (30%): Lower feature IDs (earlier in plan) get higher score

2. **Claims task** - Claims the task using limps MCP `claim_task` tool to prevent conflicts

3. **Assesses agent status** - Checks completion state and file organization

4. **Opens agent file in Cursor** - Opens the selected or specified agent file with context

5. **Displays instructions** - Shows quick links and next steps

## Usage Examples

### Select and Run Next Task

```
/run-agent 0004-datagrid-overhaul
```

This will:

- Analyze the plan to find the next best agent task
- Display selection with score breakdown
- Verify agent status
- Open the agent file in Cursor
- Show context and instructions

### Run Specific Agent File

```
/run-agent --agent plans/0004-feature-name/agents/004_agent_name.agent.md
```

Opens the specified agent file directly in Cursor.

**To find agents**: Use `/plan-list-agents <plan-number>` to see all available agents with clickable links, then use `/run-agent --agent [path]` to run the specific one you want.

### Assess Agent Status

```
/run-agent --assess 0004-datagrid-overhaul
```

Assesses all agents in the plan for completion status and file organization.

## Instructions for Claude

**When this command is invoked, you must:**

1. **Get next task or parse arguments:**
   - If plan name provided: Use `limps next-task <plan-name>` to get the next best task
   - If `--agent` provided: Use the specified agent file path
   - If `--assess` provided: Use `limps status <plan-name>` to assess plan status

2. **Claim Task (CRITICAL - Do this first):**
   - After determining which agent file will be opened, **immediately claim the task** using limps MCP `claim_task` tool
   - **Extract plan name** from agent file path: `plans/<plan-name>/agents/...` → `<plan-name>` (e.g., `0004-feature-name`)
   - **Extract feature number(s)** from agent file content: Look for `### Feature #<number>:` patterns (e.g., `#1`, `#2`)
   - **Construct taskId**: Format is `<plan-name>#<feature-number>` (e.g., `0004-feature-name#1`)
   - **Extract agentId** from agent file name: `<agent-file-name>` (e.g., `000_agent_name.agent.md`)
   - **For agents with multiple features**: Claim each feature separately, or claim the first/primary feature
   - Call: `call_mcp_tool` with server `limps`, tool `claim_task`, arguments:
     ```json
     {
       "taskId": "<plan-name>#<feature-number>",
       "agentId": "<agent-file-name>",
       "persona": "coder"
     }
     ```
   - **Example**: For agent file `plans/0004-feature-name/agents/000_agent_name.agent.md` with Feature #1:
     ```json
     {
       "taskId": "0004-feature-name#1",
       "agentId": "000_agent_name.agent.md",
       "persona": "coder"
     }
     ```
   - **This must happen BEFORE opening the file or starting work** to prevent conflicts
   - **Note**: The server expects taskId format `<plan-name>#<feature-number>`, not the agent file path

3. **Open agent file:**
   - Use `open_document_in_cursor` MCP tool to open the agent file in Cursor
   - Or use `cursor` CLI command if MCP tool not available

4. **Display output:**
   - Show task selection results (if applicable)
   - Show agent status assessment
   - Show context and instructions
   - Display clickable file links

5. **Provide guidance:**
   - Explain next steps for the agent
   - Reference related commands (`/close-feature-agent`, `limps status`, `limps next-task`)
   - Show how to verify completion

## Integration with Other Commands

- **next-task**: Use `limps next-task <plan-name>` to get the next best task. Then use `/run-agent <plan-name>` to start work
- **plan-list-agents**: Use to find and see all agents in a plan, then use `/run-agent --agent [path]` to run a specific one
- **list-feature-plans**: Use to discover plans, then use `/run-agent <plan-name>`
- **close-feature-agent**: After closing, use `limps status <plan-name>` to assess overall status
- **update-feature-plan**: After updating, use `limps next-task <plan-name>` to get next task

## Workflow

### Basic Workflow

```
1. List plans: /list-feature-plans
2. Select next task: /run-agent <plan-name>
3. Agent implements work
4. Verify completion: /close-feature-agent <agent-path>
5. Assess status: /run-agent --assess <plan-name>
6. Repeat from step 2
```

### Recommended Workflow

```
1. Get next task: `limps next-task <plan-name>` (suggests next task)
2. Start work: /run-agent <plan-name> (uses next task from step 1)
3. Agent implements work
4. Verify completion: /close-feature-agent <agent-path>
5. Repeat from step 1
```

## Output Format

The command outputs:

- **Task Selection** (if applicable):
  - Agent name and features
  - Status breakdown (GAP/WIP counts)
  - Score breakdown (dependencies, priority, workload)
  - Agent file path

- **Status Assessment**:
  - File organization status
  - Agent file status vs README.md status
  - Recommendations for cleanup

- **Context Display**:
  - Agent name and features
  - Dependencies status
  - Clickable links to plan.md, interfaces.md, gotchas.md, README.md
  - Instructions for next steps

## Example Output

```
Next Best Task: 004_agent_selection__expander_columns.agent.md

Agent: Selection & Expander Columns
Features: #4, #5, #6
Status: 2 GAP, 1 WIP
Score: 85/100
  - Dependencies: 40/40 (all unblocked)
  - Priority: 25/30 (avg feature #5)
  - Workload: 20/30 (3 remaining tasks)

🚀 Starting Agent Work: 004_agent_selection__expander_columns.agent.md

Agent: Selection & Expander Columns
Features: #4, #5, #6
Dependencies: All satisfied ✓

Quick Links:
  plan.md
  interfaces.md
  gotchas.md
  README.md

Instructions:
1. Agent file opened in Cursor
2. Copy agent file content to Cursor Agent Chat
3. Agent implements features per spec
4. Run: `limps status 0004-feature-name` to check status when done
5. Run: `/close-feature-agent [agent-path]` to verify completion
```

## Error Handling

- **No unblocked tasks**: Reports "All tasks completed or blocked"
- **Agent file missing**: Reports error with suggestions
- **Plan not found**: Suggests using `/list-feature-plans` to find correct plan name
- **Cursor CLI not found**: Shows installation instructions

## Notes

- The command uses limps MCP `open_document_in_cursor` tool or `cursor` CLI to open files
- Agent files are opened in Cursor for editing
- Status assessment uses `limps status` to check plan progress
- Scoring algorithm prioritizes unblocked tasks to maximize parallel work
- For best results, use `limps next-task <plan-name>` first to get the next task, then use `/run-agent <plan-name>` to start it
