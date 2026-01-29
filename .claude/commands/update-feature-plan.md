# Update Feature Plan v2.0.0

Apply feedback to an existing plan, regenerate affected agent files, and commit after approval.

## Key Change from v1.x

**Old**: Update plan.md + speed_prompts.md (summaries)
**New**: Update plan.md + regenerate affected `agents/*.agent.md` (distilled execution files)

Agent files are **distilled**, not copied. When plan changes, affected agent files must be regenerated.

## Invocation

```
/update-feature-plan [plan-name-or-path]
```

## Workflow

```
1. Identify plan
2. Gather feedback
3. Read current state
4. Analyze & propose changes
5. User approves
6. Apply to plan file, interfaces.md
7. Identify affected agents
8. Regenerate affected agent files (distill, don't copy)
9. Verify consistency
10. Commit
11. Assess status: `limps next-task <plan-name>` (optional, see next task)
```

## After Update

After updating a plan and regenerating agent files:

1. **Assess plan status**: Run `limps status <plan-name>` to see overall plan status
2. **Start next work**: Use `limps next-task <plan-name>` to get the next task, then use `/run-agent <plan-name>` to start it

This helps ensure the plan is in a good state after updates and ready for continued work.

## Instructions

### 1. Identify the Plan

**Use `/limps-plan-operations identify-plan` skill** for consistent plan identification:

- Ask: "Which plan to update?"
- If unsure: Use `limps list-plans` or limps MCP `list_plans` tool
- Confirm plan directory exists

### 2. Gather Feedback

Accept feedback via:

- Paste directly
- File path: `@feedback.md`
- Description: "Add accessibility to #3"

Parse feedback for:

- Feature changes (add/remove/modify)
- Interface changes (affects downstream agents)
- Status updates
- Gotcha discoveries
- Dependency changes
- Test coverage gaps

### 3. Read Current State

**Use `/limps-plan-operations load-artifacts` skill** for consistent artifact loading:

```
[plan-name]/
├── README.md
├── {plan-name}-plan.md           # Full verbose specs
├── interfaces.md     # Contract source of truth
├── gotchas.md
└── agents/
    └── *.agent.md    # Minimal execution files
```

Read all files using limps MCP `process_doc` and `process_docs` tools to understand current state.

### 4. Analyze & Propose Changes

For each feedback item, classify:

| Type                    | Action                            |
| ----------------------- | --------------------------------- |
| **Actionable**          | Propose specific change with diff |
| **Needs Clarification** | Ask user                          |
| **Out of Scope**        | Note and skip                     |

**Critical**: Identify interface changes—these cascade to dependent agents.

### 5. Present Proposed Changes

````markdown
## Proposed Changes: [plan-name]

### plan.md

**Change**: Add Feature #7 Accessibility
**Diff**:

```diff
+ ### #7: Accessibility
+ [full verbose spec...]
```
````

### interfaces.md

**Change**: Add #7 exports
**Diff**:

```diff
+ ## #7: Accessibility
+ export function useAriaLabels(): AriaState;
```

### Affected Agents

| Agent            | Why                            | Action     |
| ---------------- | ------------------------------ | ---------- |
| columns.agent.md | #7 added to scope              | Regenerate |
| rows.agent.md    | Depends on #3 interface change | Regenerate |

**Ready to apply?** (yes/no)

````

### 6. Apply Changes (After Approval)

**Planning docs** (verbose):
- Update plan file (`{plan-name}-plan.md`) with full feature specs using limps MCP `update_doc` tool
- Update `interfaces.md` if contracts change using `update_doc`
- Update `README.md` status matrix using `update_doc`
- Append to `gotchas.md` if new issues using `update_doc`

**Agent files** (distilled):
- **Regenerate** affected agent files using limps MCP `create_doc` or `update_doc` tool, don't patch
- Distill from updated plan file
- Target ~200-400 lines per agent

### 7. Identify Affected Agents

An agent file needs regeneration if:

| Change | Affected Agents |
|--------|-----------------|
| Feature added to agent's scope | That agent |
| Feature removed from agent's scope | That agent |
| Feature modified in agent's scope | That agent |
| Interface changed | All agents that depend on it |
| Dependency changed | Agents with that dependency |
| Gotcha discovered | Agents working on affected features |

### 8. Regenerate Agent Files

**Distill, don't copy**. Agent files contain:

| Include | Exclude |
|---------|---------|
| Feature IDs + TL;DRs | Full Gherkin |
| Interface contracts | Detailed test code |
| Files to create/modify | Methodology explanations |
| Test IDs | Other agents' details |
| TDD one-liners | Historical context |
| Relevant gotchas | |
| Done checklist | |

Target: ~200-400 lines for 2-4 features.

### 9. Verify Consistency

- [ ] All features in plan file have an assigned agent
- [ ] All agent files reflect current plan file
- [ ] interfaces.md matches agent exports/receives
- [ ] README.md status matrix is current
- [ ] Dependency graph is accurate
- [ ] No orphaned features

### 10. Commit (After Final Approval)

If the planning documents are in a git repository, commit the changes:

```bash
git add plans/[plan-name]/
git commit -m "update(plans): [plan-name] - [description]"
```

## Common Scenarios

### Adding a Feature

1. Add to plan file (verbose spec)
2. Add to `interfaces.md` if it exports anything
3. Assign to an agent
4. Regenerate that agent's file
5. Update README.md status matrix

### Modifying a Feature

1. Update in plan file
2. Update `interfaces.md` if exports changed
3. Regenerate owning agent's file
4. If interface changed: regenerate dependent agents

### Interface Change (Cascading)

Most impactful change—affects downstream agents.

1. Update `interfaces.md` (source of truth)
2. Update plan file feature spec
3. Identify all agents that receive this interface
4. Regenerate ALL affected agent files
5. Mark downstream features as potentially BLOCKED if breaking

Example:

```markdown
## Interface Change: #2 Headers

**Change**: `useColumnHeader` now returns `isResizing: boolean`

**Affected Agents**:
| Agent | Features | Reason |
|-------|----------|--------|
| columns | #2 | Owns the interface |
| rows | #5 | Receives from #2 |
| integration | #8 | Receives from #2 |

**Action**: Regenerate all 3 agent files
```

### Status Update

1. Update feature status in plan file
2. Update README.md status matrix
3. **Don't regenerate agent files** (status is in agent's own file)

### Dependency Change

1. Update plan file feature dependencies
2. Update `parallelization.md` if exists
3. Regenerate affected agent files
4. Update README.md graph

### Gotcha Discovered

1. Append to `gotchas.md`
2. Add to affected features in plan file
3. Regenerate agent files that need to know

## Plan Analysis with limps MCP Tools

Use limps `process_doc` tool to analyze plans before and after updates:

```typescript
// Find all features affected by an interface change
const affectedFeatures = await call_mcp_tool({
  server: 'limps',
  toolName: 'process_doc',
  arguments: {
    path: 'plans/[plan-name]/[plan-name]-plan.md',
    code: `
      const features = extractFeatures(doc.content);
      const interface = extractInterfaces(doc.content).find(i => i.name === 'useColumnHeader');
      return features.filter(f => f.dependsOn?.includes(interface.id));
    `,
  },
});

// Compare feature status before/after update
const statusDiff = await call_mcp_tool({
  server: 'limps',
  toolName: 'process_doc',
  arguments: {
    path: 'plans/[plan-name]/[plan-name]-plan.md',
    code: `
      const features = extractFeatures(doc.content);
      return {
        gap: features.filter(f => f.status === 'GAP').length,
        wip: features.filter(f => f.status === 'WIP').length,
        pass: features.filter(f => f.status === 'PASS').length
      };
    `,
  },
});
```

## Change Proposal Format

````markdown
## Proposed Changes: datagrid_overhaul_abc123

### Summary

| File                    | Changes               | Lines |
| ----------------------- | --------------------- | ----- |
| Plan file                 | +1 feature, ~50 lines | +50   |
| interfaces.md           | +1 interface          | +15   |
| agents/columns.agent.md | Regenerate            | ~220  |
| README.md               | Status update         | +1    |

### Details

#### Plan File

**Add Feature #7: Accessibility**

```diff
+ ### #7: Accessibility
+
+ **Area**: CORE
+ **Agent**: Columns
+ ...
```
````

#### interfaces.md

**Add #7 exports**

````diff
+ ## #7: Accessibility
+
+ **Agent**: Columns | **Status**: GAP | **Used by**: none
+
+ ```typescript
+ export function useAriaLabels(id: string): AriaState;
+ ```
````

#### agents/columns.agent.md

**Regenerate** (feature added to scope)

- Current: 180 lines, features #2, #3, #4
- New: ~220 lines, features #2, #3, #4, #7

### Affected Agents

| Agent            | Regenerate? | Reason     |
| ---------------- | ----------- | ---------- |
| columns.agent.md | ✅ Yes      | #7 added   |
| rows.agent.md    | ❌ No       | No changes |
| core.agent.md    | ❌ No       | No changes |

---

**Ready to apply?** (yes/no)

```

## Flags

```

/update-feature-plan [path] --dry-run # Show changes, don't apply
/update-feature-plan [path] --force # Skip approval prompts
/update-feature-plan [path] --agents-only # Only regenerate agent files

```

## Integration with Other Commands

| Command | Purpose | When |
|---------|---------|------|
| `create-feature-plan` | Create new plan | Starting work |
| **`update-feature-plan`** | Modify plan, regenerate agents | Mid-flight changes |
| `close-feature-agent` | Verify completion, sync status | Agent finishes |
| `limps next-task` | Get next best task | After update |
| `limps status` | Assess plan status | Check progress |

Typical flow:
```

create-feature-plan
↓
[agent implements]
↓
close-feature-agent (verify, sync status)
↓
update-feature-plan (if interfaces evolved) ←── YOU ARE HERE
↓
[regenerated agent files ready]
↓
limps next-task (get next task)
↓
run-agent (start next task)
↓
[next agent implements]

```

## Notes

- **Distill, don't copy**: Agent files are refined extracts, not copies
- **Interface changes cascade**: Always identify dependent agents
- **Regenerate, don't patch**: Cleaner than surgical edits
- **Verify consistency**: All files must agree
- **Use limps MCP tools**: Use `process_doc`, `update_doc`, `create_doc` for all document operations
```
