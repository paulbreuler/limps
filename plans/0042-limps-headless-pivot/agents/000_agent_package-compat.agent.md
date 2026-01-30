# Agent 0: Package Identity + Policy

**Plan Location**: `plans/0042-0042-limps-headless-pivot/0042-0042-limps-headless-pivot-plan.md`

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

### #0: Package Identity + Backward Compatibility

TL;DR: Rename to `limps-headless`, keep `limps radix` alias with deprecation warning.
Status: `GAP`
Test IDs: `headless-cli-alias`, `headless-exports`
Files: `packages/limps-headless/package.json` (create), `packages/limps-headless/src/cli/index.ts` (create)

TDD:
1. `radix alias routes to headless` → add alias command → share CLI registry
2. `headless exports are present` → update package.json → consolidate exports map
3. `config defaults load` → add config schema → merge legacy config

Gotchas:
- alias must preserve legacy args ordering

---

### #5: Config + Policy Enforcement

TL;DR: Add `--backend`/`--mode` flags + migration thresholds to fail builds.
Status: `GAP`
Test IDs: `policy-base-only`, `policy-threshold`
Files: `packages/limps-headless/src/cli/flags.ts` (update), `packages/limps-headless/src/config.ts` (update)

TDD:
1. `backend flag parsed` → add CLI option parsing → share config loader
2. `base-only fails with radix` → implement policy gate → centralize exit codes
3. `threshold triggers failure` → add severity checker → reuse gating utility

Gotchas:
- avoid breaking existing `limps radix` flags

---

## Done

- [ ] TDD cycles pass
- [ ] CLI aliases verified
- [ ] Config defaults documented
- [ ] Status → PASS
