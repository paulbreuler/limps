---
title: Context Resolver
status: GAP
persona: coder
depends_on: [000]
files:
  - src/context/resolver.ts
  - src/context/merge.ts
  - src/cli/commands/context/resolve.ts
tags: [context, inheritance, resolver]
---

# Agent 001: Context Resolver

## Objective

Build the context inheritance engine that resolves cascading context from workspace → project → plan → agent.

## Tasks

1. **Context layer loading** (`src/context/resolver.ts`)
   - Load workspace layer (priority 0)
   - Load project layer if exists (priority 10)
   - Load plan layer (priority 20)
   - Load agent layer (priority 30)
   - Track source file for each value

2. **Merge strategy** (`src/context/merge.ts`)
   - Higher priority wins for scalar values
   - Lists concatenate (child adds to parent)
   - Objects deep merge
   - `override: true` replaces entirely
   - `inherit: false` opts out

3. **Resolve CLI** (`src/cli/commands/context/resolve.ts`)
   - `limps context resolve` — workspace only
   - `limps context resolve <plan>` — with plan context
   - `limps context resolve <plan> <agent>` — full stack
   - `--diff` shows what each layer contributed
   - `--json` for machine consumption

## Resolution Algorithm

```typescript
async function resolveContext(planId?: string, agentId?: string): Promise<ResolvedContext> {
  const layers: ContextLayer[] = [];
  
  // Build layer stack
  layers.push(...await loadWorkspaceLayers());
  if (planId) {
    const projectId = await findProjectForPlan(planId);
    if (projectId) layers.push(await loadProjectLayer(projectId));
    layers.push(await loadPlanLayer(planId));
    if (agentId) layers.push(await loadAgentLayer(planId, agentId));
  }
  
  // Merge with priority resolution
  return mergeLayers(layers);
}
```

## Acceptance Criteria

- [ ] `limps context resolve` outputs workspace context
- [ ] `limps context resolve 0042 001` includes all layers
- [ ] Higher priority values override lower
- [ ] `--diff` shows contribution per layer
- [ ] Resolution completes in < 100ms
