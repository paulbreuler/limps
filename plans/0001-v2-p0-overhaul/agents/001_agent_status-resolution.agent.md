---
status: PASS
persona: coder
claimedBy: null
dependencies: ["000"]
blocks: []
files:
  - src/cli/task-resolver.ts
  - src/cli/status.ts
  - src/commands/status.tsx
  - src/components/AgentStatus.tsx
---

# Agent 001: Per-Agent Status + Shorthand Resolution

**Plan Location:** `plans/0001-v2-p0-overhaul/plan.md`

## Scope

Features: #2 (Per-Agent Status), #3 (Shorthand Task ID Resolution)
Own: `src/cli/task-resolver.ts`
Modify: `src/cli/status.ts`, `src/cli/status.tsx`, task commands
Depend on: Agent 000 (JSON envelope for `--json` output)
Block: None

## Interfaces

### Export

```typescript
// src/cli/task-resolver.ts
export interface ResolvedTaskId {
  planFolder: string;
  agentNumber: string;
  taskId: string;
  path: string;
}

export function resolveTaskId(
  input: string,
  options?: { plansPath: string; planContext?: string }
): ResolvedTaskId;

export function findPlansByPrefix(plansPath: string, prefix: string): string[];

// src/cli/status.ts (extended)
export interface AgentStatusSummary {
  taskId: string;
  title: string;
  planId: string;
  planName: string;
  agentNumber: string;
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  persona: 'coder' | 'reviewer' | 'pm' | 'customer';
  claimed?: { at: string; by: string; elapsed: string };
  heartbeat?: { last: string; stale: boolean };
  features: { total: number; pass: number; wip: number; gap: number; blocked: number };
  files: Array<{ path: string; locked: boolean }>;
  dependencies: Array<{ taskId: string; title: string; status: string; satisfied: boolean }>;
}

export function getAgentStatusSummary(
  config: ServerConfig,
  resolvedId: ResolvedTaskId,
  coordination: CoordinationState
): AgentStatusSummary;
```

### Receive

```typescript
// From Agent 000 (json-output.ts) ✅ READY when Agent 000 complete
export function wrapSuccess<T>(data: T): JsonSuccess<T>;
export function wrapError(message: string, options?: { suggestions?: string[] }): JsonError;
export function outputJson<T>(envelope: JsonEnvelope<T>, exitCode?: number): never;
```

## Feature #2: Per-Agent Status

TL;DR: Add `limps status --agent <id>` for granular agent visibility.
Status: `GAP`
Test IDs: `agent-status-*`
Files:
- `src/cli/status.ts` (modify)
- `src/cli/status.tsx` (modify)

TDD:
1. `agent-status-summary-basic` → Create `getAgentStatusSummary()` → Returns AgentStatusSummary
2. `agent-status-includes-claimed` → Query coordination.json → Extract claim info
3. `agent-status-calculates-elapsed` → Calculate duration from claim time → ISO duration format
4. `agent-status-includes-heartbeat` → Query coordination for heartbeat → Determine if stale
5. `agent-status-includes-features` → Parse agent content for features → Count by status
6. `agent-status-includes-files` → Get files from frontmatter → Check lock status
7. `agent-status-includes-deps` → Parse dependencies → Check satisfaction
8. `status-accepts-agent-flag` → Add `--agent` to status command → Route to agent handler
9. `agent-status-human-output` → Create AgentStatusBox component → Box UI with sections
10. `agent-status-json-output` → Return JSON when --json → Use wrapSuccess()

Gotchas:
- Heartbeat source: Read from coordination.json agents[agentId].heartbeat, not file mtime
- Feature parsing: Agent files have markdown sections with Status: `GAP` patterns, not frontmatter
- Elapsed time: Use ISO 8601 duration format (PT47M, PT2H30M) for JSON portability

## Feature #3: Shorthand Task ID Resolution

TL;DR: Support `0001#002`, `002`, and full paths interchangeably.
Status: `GAP`
Test IDs: `task-resolver-*`
Files:
- `src/cli/task-resolver.ts` (create)
- `src/cli/claim-task.tsx` (modify)
- `src/cli/release-task.tsx` (modify)
- `src/cli/next-task.tsx` (modify)

TDD:
1. `resolve-full-task-id` → Parse "0001-network-panel#002" → Direct match
2. `resolve-plan-agent-shorthand` → Parse "0001#002" → Find plan by prefix
3. `find-plans-by-prefix` → Glob plans directory → Return matches
4. `resolve-ambiguous-throws` → Multiple prefix matches → Throw with suggestions
5. `resolve-agent-only-with-context` → Parse "002" with planContext → Use context
6. `resolve-agent-only-no-context-throws` → Parse "002" without context → Clear error
7. `resolve-from-path` → Parse full path → Extract plan/agent
8. `integrate-resolver-claim-task` → Use resolver in claim-task → Replace direct parsing
9. `integrate-resolver-release-task` → Use resolver in release-task → Same pattern
10. `integrate-resolver-next-task` → Use resolver for --plan flag → Support prefix

Gotchas:
- Case sensitivity: macOS is case-insensitive, Linux is case-sensitive. Use exact match.
- Caching: Don't cache glob results; plans can change during session.
- Existing parseTaskId: agent-parser.ts has `parseTaskId()` - extend, don't duplicate.

## Implementation Notes

### Task Resolver Algorithm

```typescript
function resolveTaskId(input: string, options: Options): ResolvedTaskId {
  // 1. Try as full path
  if (input.includes('/') && input.endsWith('.agent.md')) {
    return resolveFromPath(input);
  }

  // 2. Try as full task ID (contains #)
  if (input.includes('#')) {
    const [planPart, agentPart] = input.split('#');
    const plans = findPlansByPrefix(options.plansPath, planPart);
    if (plans.length === 0) throw planNotFoundError(planPart, listAllPlans());
    if (plans.length > 1) throw ambiguousError(planPart, plans);
    return buildResolved(plans[0], agentPart);
  }

  // 3. Try as agent number only (requires context)
  if (/^\d+$/.test(input)) {
    if (!options.planContext) throw Error('Agent number requires --plan context');
    return buildResolved(options.planContext, input);
  }

  throw Error(`Invalid task ID format: ${input}`);
}
```

### Agent Status Box UI

```
┌─────────────────────────────────────────────────┐
│ Agent: 002 - Implement API endpoints            │
├─────────────────────────────────────────────────┤
│ Plan:      0001-network-panel                   │
│ Status:    WIP                                  │
│ Persona:   coder                                │
│ Claimed:   2026-01-25T14:32:00Z (47m ago)       │
│ Heartbeat: 2026-01-25T15:18:45Z (1m ago)        │
├─────────────────────────────────────────────────┤
│ Features:  4 total                              │
│   ✓ PASS   2  (Setup, Types)                   │
│   ◐ WIP    1  (GET endpoint)                   │
│   ○ GAP    1  (POST endpoint)                  │
└─────────────────────────────────────────────────┘
```

## Done

- [x] `src/cli/task-resolver.ts` created
- [x] `resolveTaskId()` handles all formats (full path, full ID, prefix#agent, agent-only)
- [x] `findPlansByPrefix()` works (including numeric matching e.g., "1" matches "0001")
- [x] Ambiguous shorthands throw with suggestions (AmbiguousTaskIdError)
- [x] `getAgentStatusSummary()` returns full status (features, files, deps, heartbeat)
- [x] `limps status --agent 0001#002` works
- [x] `limps status 0001 --agent 002` works (with plan context)
- [x] JSON output works for agent status (--json flag)
- [x] AgentStatus component created with full UI
- [x] All tests pass (808 tests total)
- [x] Status → PASS
