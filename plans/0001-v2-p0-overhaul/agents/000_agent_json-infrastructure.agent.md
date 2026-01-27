---
status: PASS
persona: coder
dependencies: []
blocks: ["001", "002"]
files:
  - src/cli/json-output.ts
  - src/cli/list-plans.tsx
  - src/cli/list-agents.tsx
  - src/cli/status.tsx
  - src/cli/next-task.tsx
  - src/cli/config-cmd.tsx
---

# Agent 000: JSON Output Infrastructure

**Plan Location:** `plans/0001-v2-p0-overhaul/plan.md`

## Scope

Features: #1 (JSON Output Infrastructure)
Own: `src/cli/json-output.ts`
Modify: All CLI command files
Depend on: None
Block: Agent 001, Agent 002 (they need JSON envelope helpers)

## Interfaces

### Export

```typescript
// src/cli/json-output.ts
export interface JsonSuccess<T> {
  success: true;
  data: T;
}

export interface JsonError {
  success: false;
  error: string;
  code?: string;
  suggestions?: string[];
}

export type JsonEnvelope<T> = JsonSuccess<T> | JsonError;

export function wrapSuccess<T>(data: T): JsonSuccess<T>;
export function wrapError(message: string, options?: { code?: string; suggestions?: string[] }): JsonError;
export function outputJson<T>(envelope: JsonEnvelope<T>, exitCode?: number): never;
```

### Receive

None - this is the foundation agent.

## Feature #1: JSON Output Infrastructure

TL;DR: Add `--json` flag to all CLI commands for machine-readable output.
Status: `GAP`
Test IDs: `json-output-*`
Files:
- `src/cli/json-output.ts` (create)
- `src/cli/list-plans.tsx` (modify)
- `src/cli/list-agents.tsx` (modify)
- `src/cli/status.tsx` (modify)
- `src/cli/next-task.tsx` (modify)
- `src/cli/config-cmd.tsx` (modify)

TDD:
1. `json-envelope-success` → Create `wrapSuccess()` → `{ success: true, data }`
2. `json-envelope-error` → Create `wrapError()` → `{ success: false, error, suggestions }`
3. `json-output-exits` → Create `outputJson()` → console.log + process.exit
4. `list-plans-json-flag` → Add --json to list-plans → Use Pastel option
5. `list-plans-json-output` → Conditional render → If --json, call outputJson
6. `list-agents-json` → Same pattern → Add flag + conditional
7. `status-json` → Same pattern → Export PlanStatusSummary
8. `next-task-json` → Same pattern → Export TaskScoreBreakdown
9. `config-show-json` → Same pattern → Export config object
10. `config-list-json` → Same pattern → Export project list

Gotchas:
- Ink/React: When --json, bypass Ink entirely. Don't even render components.
- Exit codes: Error states must `process.exitCode = 1` before `outputJson()`.
- Stderr: Progress spinners go to stderr; only final JSON to stdout.
- Pastel integration: Check how Pastel handles custom options in command components.

## Implementation Notes

### Pattern for CLI Commands

```typescript
// Pattern for each CLI command
export default function ListPlans({ json }: { json?: boolean }) {
  // Early return for JSON mode - bypass all Ink rendering
  if (json) {
    try {
      const data = getPlansData(config);
      outputJson(wrapSuccess(data));
    } catch (err) {
      outputJson(wrapError(err.message, { suggestions: err.suggestions }), 1);
    }
  }

  // Normal Ink rendering below
  return <Box>...</Box>;
}
```

### Pastel Option Definition

```typescript
// In command file
export const options = z.object({
  json: z.boolean().optional().describe('Output as JSON'),
});
```

## Done

- [x] `src/cli/json-output.ts` created with envelope helpers
- [x] `wrapSuccess()` returns `{ success: true, data }`
- [x] `wrapError()` returns `{ success: false, error, ... }`
- [x] `outputJson()` writes to stdout and exits
- [x] `limps list-plans --json` works
- [x] `limps list-agents <plan> --json` works
- [x] `limps status <plan> --json` works
- [x] `limps next-task <plan> --json` works
- [x] `limps config show --json` works
- [x] `limps config list --json` works
- [x] All tests pass (742 tests)
- [x] Status → PASS
