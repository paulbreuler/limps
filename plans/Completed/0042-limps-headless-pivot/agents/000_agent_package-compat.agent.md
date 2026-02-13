# Agent 0: Package Identity + Policy

**Plan Location**: `plans/0042-limps-headless-pivot/0042-limps-headless-pivot-plan.md`

## Scope

Features: #0, #5
Own: `packages/limps-headless/package.json`, `packages/limps-headless/src/cli/*`, `packages/limps-headless/src/config.ts`
Depend on: Agent 001 for discovery types
Block: Agent 003 (tests) until flags + config land

## Interfaces

### Export

```typescript
// #5
export type BackendMode = 'auto' | 'base' | 'radix-legacy';
export type MigrationThreshold = 'low' | 'medium' | 'high';
export interface RunAuditOptions {
  backendMode: BackendMode;
  migrationThreshold: MigrationThreshold;
  failOnMixed: boolean;
  includeLegacy: boolean;
}
```

### Receive

```typescript
// #1 (Agent 001) ✅ READY
export type HeadlessBackend = 'radix' | 'base' | 'mixed' | 'unknown';
```

## Features

### #0: Package Identity

TL;DR: Rename to `limps-headless`; CLI entrypoint is `limps-headless` only (no alias).
Status: `PASS`
Test IDs: `headless-exports`
Files: `packages/limps-headless/package.json` (create), `packages/limps-headless/src/cli/index.ts` (create)

TDD:
1. `headless exports are present` → update package.json → consolidate exports map
2. `config defaults load` → add config schema → merge legacy config

---

### #5: Config + Policy Enforcement

TL;DR: Add `--backend`/`--mode` flags + migration thresholds to fail builds.
Status: `PASS`
Test IDs: `policy-base-only`, `policy-threshold`
Files: `packages/limps-headless/src/cli/flags.ts` (update), `packages/limps-headless/src/config.ts` (update)

TDD:
1. `backend flag parsed` → add CLI option parsing → share config loader
2. `base-only fails with radix` → implement policy gate → centralize exit codes
3. `threshold triggers failure` → add severity checker → reuse gating utility

Gotchas:
- avoid breaking existing CLI flags when adding options

---

## Done

- [x] TDD cycles pass
- [x] CLI entrypoint verified
- [x] Config defaults documented
- [x] Status → PASS

<!-- limps:graph-links:start -->
## LIMPS Graph Links

Plan:
- [Plan](../0042-limps-headless-pivot-plan.md)

Depends on:
_No dependencies found_

Blocks:
_No blocks found_

<!-- limps:graph-links:end -->
