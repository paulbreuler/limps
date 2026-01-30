# Agent 1: Discovery + Providers

**Plan Location**: `plans/0042-0042-limps-headless-pivot/0042-0042-limps-headless-pivot-plan.md`

## Scope

Features: #1, #2
Own: `packages/limps-headless/src/audit/discover-components.ts`, `packages/limps-headless/src/providers/*`
Depend on: Agent 000 for config/types
Block: Agent 002 (migration) until inventory shape is final

## Interfaces

### Export

```typescript
// #1
export type HeadlessBackend = 'radix' | 'base' | 'mixed' | 'unknown';
export interface ComponentInventory {
  name: string;
  filePath: string;
  backend: HeadlessBackend;
  mixedUsage: boolean;
  importSources: string[];
  evidence: string[];
  exportsComponent: boolean;
  exportedNames: string[];
}

// #2
export interface BackendProvider {
  id: 'radix' | 'base';
  label: string;
  deprecated?: boolean;
  detectImports(imports: string[]): boolean;
  detectPatterns(evidence: string[]): boolean;
  analyzeComponent(component: ComponentInventory): Issue[];
  analyzeProject(components: ComponentInventory[]): Issue[];
}
```

### Receive

```typescript
// #0/#5 (Agent 000) ✅ READY
export interface RunAuditOptions {
  backendMode: 'auto' | 'base' | 'radix-legacy';
  migrationThreshold: 'low' | 'medium' | 'high';
  failOnMixed: boolean;
  includeLegacy: boolean;
}
```

## Features

### #1: Unified Component Discovery

TL;DR: Tag each component with backend detection + evidence.
Status: `GAP`
Test IDs: `discovery-base`, `discovery-radix`, `discovery-mixed`
Files: `packages/limps-headless/src/audit/discover-components.ts` (update)

TDD:
1. `import detection` → add import scanner → consolidate match helpers
2. `pattern evidence` → add JSX attribute scan → record evidence
3. `mixed/unknown resolution` → add resolver → isolate logic
4. `re-export tracing` → follow export map → share resolver

Gotchas:
- avoid false positives from unrelated `render` prop usage

---

### #2: Backend Providers (Radix + Base)

TL;DR: Providers supply backend-specific rules and metadata.
Status: `GAP`
Test IDs: `provider-registry`, `provider-radix`, `provider-base`
Files: `packages/limps-headless/src/providers/interface.ts` (update), `packages/limps-headless/src/providers/base.ts` (create)

TDD:
1. `provider interface` → add registry → normalize lookup
2. `radix provider` → adapt existing rules → move constants
3. `base provider` → add Base rules → share helpers

Gotchas:
- keep Radix provider marked deprecated for warning output

---

## Done

- [ ] Discovery tags are deterministic
- [ ] Providers cover both backends
- [ ] Status → PASS
