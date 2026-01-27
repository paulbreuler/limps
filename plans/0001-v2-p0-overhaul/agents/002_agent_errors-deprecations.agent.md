---
status: PASS
persona: coder
dependencies:
  - "000"
blocks: []
files:
  - src/utils/errors.ts
  - src/utils/suggestions.ts
  - src/utils/deprecations.ts
  - src/config.ts
---

# Agent 002: Error Messages + Deprecations

**Plan Location:** `plans/0001-v2-p0-overhaul/plan.md`

## Scope

Features: #4 (Improved Error Messages), #5 (Config Deprecation Warnings)
Own: `src/utils/suggestions.ts`, `src/utils/deprecations.ts`
Modify: `src/utils/errors.ts`, `src/config.ts`
Depend on: Agent 000 (JSON error format)
Block: None

## Interfaces

### Export

```typescript
// src/utils/errors.ts (extended)
export class LimpsError extends Error {
  readonly code: string;
  readonly suggestions: string[];
  constructor(message: string, options?: { code?: string; suggestions?: string[]; cause?: Error });
  toJson(): JsonError;
}

export function taskNotFoundError(taskId: string, availableAgents: string[]): LimpsError;
export function planNotFoundError(planId: string, availablePlans: string[]): LimpsError;

// src/utils/suggestions.ts
export function findSimilar(
  input: string,
  candidates: string[],
  options?: { maxDistance?: number; limit?: number }
): string[];
export function levenshteinDistance(a: string, b: string): number;

// src/utils/deprecations.ts
export interface DeprecatedOption {
  key: string;
  reason: string;
  removeVersion: string;
  migration: string;
}
export const DEPRECATED_OPTIONS: DeprecatedOption[];
export function checkDeprecations(config: Record<string, unknown>): DeprecatedOption[];
export function formatDeprecationWarning(option: DeprecatedOption): string;
export function emitDeprecationWarnings(options: DeprecatedOption[]): void;
```

### Receive

```typescript
// From Agent 000 (json-output.ts) ✅ READY when Agent 000 complete
export interface JsonError {
  success: false;
  error: string;
  code?: string;
  suggestions?: string[];
}
```

## Feature #4: Improved Error Messages

TL;DR: Add contextual suggestions and "did you mean?" to all errors.
Status: `GAP`
Test IDs: `error-*`, `suggestions-*`
Files:
- `src/utils/errors.ts` (modify)
- `src/utils/suggestions.ts` (create)
- `src/cli/error-handler.tsx` (create)

TDD:
1. `levenshtein-distance-basic` → Implement `levenshteinDistance()` → Edit distance calc
2. `levenshtein-distance-edge-cases` → Empty strings, same strings → 0 or length
3. `find-similar-basic` → Implement `findSimilar()` → Returns sorted matches
4. `find-similar-respects-limit` → Limit parameter → Caps results
5. `find-similar-respects-distance` → maxDistance parameter → Filters far matches
6. `limps-error-class` → Extend Error with code/suggestions → Constructor works
7. `limps-error-to-json` → `toJson()` method → Returns JsonError shape
8. `task-not-found-error` → Factory function → Includes available agents
9. `plan-not-found-error` → Factory function → Includes available plans
10. `error-handler-human` → Create component → Formats error with box
11. `error-handler-json` → Component → Calls outputJson with error

Gotchas:
- Levenshtein complexity: O(n*m) - keep strings short or use prefix matching for large sets
- Suggestion quality: Prefix matching often better than Levenshtein for IDs
- Error chaining: Use `cause` option for wrapped errors

## Feature #5: Config Deprecation Warnings

TL;DR: Warn users about deprecated config options before v2.0 removal.
Status: `GAP`
Test IDs: `deprecation-*`
Files:
- `src/utils/deprecations.ts` (create)
- `src/config.ts` (modify)

TDD:
1. `deprecated-options-defined` → Define `DEPRECATED_OPTIONS` → Has maxHandoffIterations, debounceDelay
2. `check-deprecations-finds-keys` → `checkDeprecations()` → Returns matching deprecated options
3. `check-deprecations-empty-for-clean` → Clean config → Returns empty array
4. `format-deprecation-warning` → `formatDeprecationWarning()` → Human-readable string
5. `emit-warnings-to-stderr` → `emitDeprecationWarnings()` → Writes to stderr
6. `config-load-checks-deprecations` → Modify `loadConfig()` → Calls check and emits
7. `deprecation-warning-format` → Warning includes key, reason, migration → Helpful message

Gotchas:
- MCP server mode: Warnings must not corrupt MCP protocol. Write to stderr, not stdout.
- Startup performance: Check should be fast, no file I/O beyond config read.
- One-time warning: Don't spam on every command. Consider session cache (or don't, keep it simple).

## Implementation Notes

### Deprecated Options

```typescript
export const DEPRECATED_OPTIONS: DeprecatedOption[] = [
  {
    key: 'maxHandoffIterations',
    reason: 'Agent handoff system is being simplified',
    removeVersion: 'v2.0.0',
    migration: 'Remove this option from your config. Handoffs will use manual coordination.',
  },
  {
    key: 'debounceDelay',
    reason: 'Implementation detail that should not be user-configurable',
    removeVersion: 'v2.0.0',
    migration: 'Remove this option from your config. A sensible default (200ms) will be used.',
  },
];
```

### Warning Format

```
⚠️  Deprecated config option: maxHandoffIterations
   Reason: Agent handoff system is being simplified
   Removal: v2.0.0
   Migration: Remove this option from your config.
```

### Error Message Format

```
Error: Task not found: 0001#999

Available agents in plan 0001-network-panel:
  - 0001#000 (Setup) - PASS
  - 0001#001 (Types) - PASS
  - 0001#002 (API) - WIP
  - 0001#003 (Tests) - GAP

Did you mean: 0001#003?
```

### Levenshtein Implementation

```typescript
export function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        );
      }
    }
  }

  return matrix[b.length][a.length];
}
```

## Done

- [x] `src/utils/suggestions.ts` created
- [x] `levenshteinDistance()` works
- [x] `findSimilar()` works with options
- [x] `LimpsError` class extends Error
- [x] `LimpsError.toJson()` returns JsonError shape
- [x] `taskNotFoundError()` includes suggestions
- [x] `planNotFoundError()` includes suggestions
- [x] `src/utils/deprecations.ts` created
- [x] `DEPRECATED_OPTIONS` defined
- [x] `checkDeprecations()` finds deprecated keys
- [x] `formatDeprecationWarning()` formats nicely
- [x] `emitDeprecationWarnings()` writes to stderr
- [x] `loadConfig()` calls deprecation check
- [x] Warnings appear for deprecated options
- [x] All tests pass (781 tests)
- [x] Status → PASS
