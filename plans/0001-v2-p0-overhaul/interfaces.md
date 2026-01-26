# Limps v2.0 P0 Interfaces

**Source of truth for TypeScript contracts between agents.**

---

## Shared Types

### JSON Output Envelope

```typescript
// src/cli/json-output.ts

/**
 * Success envelope for JSON output.
 */
export interface JsonSuccess<T> {
  success: true;
  data: T;
}

/**
 * Error envelope for JSON output.
 */
export interface JsonError {
  success: false;
  error: string;
  code?: string;
  suggestions?: string[];
}

/**
 * Union type for all JSON responses.
 */
export type JsonEnvelope<T> = JsonSuccess<T> | JsonError;

/**
 * Wrap data in success envelope.
 */
export function wrapSuccess<T>(data: T): JsonSuccess<T>;

/**
 * Wrap error in error envelope.
 */
export function wrapError(
  message: string,
  options?: { code?: string; suggestions?: string[] }
): JsonError;

/**
 * Output JSON to stdout and exit.
 * Bypasses Ink rendering entirely.
 */
export function outputJson<T>(envelope: JsonEnvelope<T>, exitCode?: number): never;
```

---

## Agent 000 Exports (JSON Infrastructure)

### JSON Output Helpers

```typescript
// src/cli/json-output.ts

export { JsonSuccess, JsonError, JsonEnvelope, wrapSuccess, wrapError, outputJson };
```

### CLI Flag Type

```typescript
// Shared option for all CLI commands
export interface JsonOutputOption {
  json?: boolean;
}
```

---

## Agent 001 Exports (Status + Resolution)

### Task Resolver

```typescript
// src/cli/task-resolver.ts

/**
 * Resolved task identifier.
 */
export interface ResolvedTaskId {
  planFolder: string;
  agentNumber: string;
  taskId: string;  // Full format: planFolder#agentNumber
  path: string;    // Full file path
}

/**
 * Resolve task ID from various formats.
 *
 * Supported formats:
 * - Full task ID: "0001-network-panel#002"
 * - Plan#Agent shorthand: "0001#002"
 * - Agent only (requires context): "002"
 * - File path: "plans/0001-network-panel/agents/002-api.agent.md"
 *
 * @param input - Task identifier in any supported format
 * @param options - Resolution options
 * @returns Resolved task ID
 * @throws LimpsError if not found or ambiguous
 */
export function resolveTaskId(
  input: string,
  options?: {
    plansPath: string;
    planContext?: string;  // Current plan for agent-only resolution
  }
): ResolvedTaskId;

/**
 * Find plans matching a prefix.
 *
 * @param plansPath - Path to plans directory
 * @param prefix - Plan prefix (e.g., "0001")
 * @returns Array of matching plan folder names
 */
export function findPlansByPrefix(plansPath: string, prefix: string): string[];
```

### Agent Status

```typescript
// src/cli/status.ts (extended)

/**
 * Agent status summary (extends existing PlanStatusSummary concept).
 */
export interface AgentStatusSummary {
  taskId: string;
  title: string;
  planId: string;
  planName: string;
  agentNumber: string;
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  persona: 'coder' | 'reviewer' | 'pm' | 'customer';
  claimed?: {
    at: string;      // ISO timestamp
    by: string;      // Agent ID
    elapsed: string; // ISO duration (e.g., "PT47M")
  };
  heartbeat?: {
    last: string;    // ISO timestamp
    stale: boolean;  // True if exceeds threshold
  };
  features: {
    total: number;
    pass: number;
    wip: number;
    gap: number;
    blocked: number;
  };
  files: Array<{
    path: string;
    locked: boolean;
  }>;
  dependencies: Array<{
    taskId: string;
    title: string;
    status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
    satisfied: boolean;
  }>;
}

/**
 * Get agent status summary.
 *
 * @param config - Server configuration
 * @param resolvedId - Resolved task ID
 * @param coordination - Coordination state
 * @returns Agent status summary
 */
export function getAgentStatusSummary(
  config: ServerConfig,
  resolvedId: ResolvedTaskId,
  coordination: CoordinationState
): AgentStatusSummary;
```

---

## Agent 002 Exports (Errors + Deprecations)

### Enhanced Errors

```typescript
// src/utils/errors.ts (extended)

/**
 * Enhanced error with suggestions.
 */
export class LimpsError extends Error {
  readonly code: string;
  readonly suggestions: string[];

  constructor(
    message: string,
    options?: {
      code?: string;
      suggestions?: string[];
      cause?: Error;
    }
  );

  /**
   * Convert to JSON error envelope.
   */
  toJson(): JsonError;
}

/**
 * Create task not found error with suggestions.
 */
export function taskNotFoundError(
  taskId: string,
  availableAgents: string[]
): LimpsError;

/**
 * Create plan not found error with suggestions.
 */
export function planNotFoundError(
  planId: string,
  availablePlans: string[]
): LimpsError;
```

### Similarity Utilities

```typescript
// src/utils/suggestions.ts

/**
 * Find items similar to input using Levenshtein distance.
 *
 * @param input - User input
 * @param candidates - Available options
 * @param options - Matching options
 * @returns Array of similar items, sorted by similarity
 */
export function findSimilar(
  input: string,
  candidates: string[],
  options?: {
    maxDistance?: number;  // Max edit distance (default: 3)
    limit?: number;        // Max results (default: 3)
  }
): string[];

/**
 * Simple Levenshtein distance calculation.
 */
export function levenshteinDistance(a: string, b: string): number;
```

### Deprecation Utilities

```typescript
// src/utils/deprecations.ts

/**
 * Deprecated configuration option.
 */
export interface DeprecatedOption {
  key: string;
  reason: string;
  removeVersion: string;
  migration: string;
}

/**
 * List of deprecated options.
 */
export const DEPRECATED_OPTIONS: DeprecatedOption[];

/**
 * Check config for deprecated options.
 *
 * @param config - Raw config object (before processing)
 * @returns Array of deprecation warnings
 */
export function checkDeprecations(config: Record<string, unknown>): DeprecatedOption[];

/**
 * Format deprecation warning for stderr.
 */
export function formatDeprecationWarning(option: DeprecatedOption): string;

/**
 * Emit deprecation warnings to stderr.
 */
export function emitDeprecationWarnings(options: DeprecatedOption[]): void;
```

---

## Cross-Agent Dependencies

| Producer | Consumer | Interface |
|----------|----------|-----------|
| Agent 000 | Agent 001 | `JsonEnvelope`, `wrapSuccess`, `wrapError`, `outputJson` |
| Agent 000 | Agent 002 | `JsonError` (for `LimpsError.toJson()`) |
| Agent 001 | Agent 002 | `ResolvedTaskId` (for error context) |

---

## Existing Interfaces (Reference)

These already exist and are used by new code:

```typescript
// src/config.ts
export interface ServerConfig {
  plansPath: string;
  docsPaths?: string[];
  fileExtensions?: string[];
  dataPath: string;
  coordinationPath: string;
  heartbeatTimeout: number;
  debounceDelay: number;        // DEPRECATED
  maxHandoffIterations: number; // DEPRECATED
}

// src/coordination.ts
export interface CoordinationState {
  version: number;
  agents: Record<string, AgentState>;
  tasks: Record<string, TaskState>;
  fileLocks: Record<string, string>;
  handoffs?: Record<string, TaskHandoff>;
}

// src/agent-parser.ts
export interface AgentFrontmatter {
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  persona: 'coder' | 'reviewer' | 'pm' | 'customer';
  dependencies: string[];
  blocks: string[];
  files: string[];
}

export interface ParsedAgentFile {
  taskId: string;
  planFolder: string;
  agentNumber: string;
  path: string;
  frontmatter: AgentFrontmatter;
  content: string;
  mtime: Date;
  title: string;
}
```
