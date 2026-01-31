---
title: Unified Package Support
status: PASS
persona: coder
dependencies:
  - "001"
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#007", "Unified Package Agent"]
created: 2026-01-28
updated: 2026-01-28
files:
  - path: packages/limps-headless/src/fetcher/unified-package.ts
    action: create
  - path: packages/limps-headless/src/fetcher/npm-registry.ts
    action: modify
  - path: packages/limps-headless/src/fetcher/unpkg.ts
    action: modify
  - path: packages/limps-headless/tests/fetcher-unified.test.ts
    action: create
---

# Agent 007: Unified Package Support (GTC-004)

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #19 (Unified Package Support)
Own: `packages/limps-headless/src/fetcher/unified-package.ts`
Depend on: Agent 001 for existing fetcher infrastructure
Block: None (enhancement)

## Problem

The current fetcher only supports individual `@radix-ui/react-*` packages (e.g., `@radix-ui/react-dialog`), but modern projects like runi use the unified `radix-ui` package (v1.4.3+). The unified package has a different structure and export pattern.

See: `gotchas.md#GTC-004`

## Interfaces

### Export

```typescript
// packages/limps-headless/src/fetcher/unified-package.ts
export type PackageSource = 'individual' | 'unified';

export interface ResolvedPackage {
  source: PackageSource;
  packageName: string;
  primitive: string;
  version: string;
  typesPath: string;
}

export async function detectPackageSource(primitive: string): Promise<PackageSource>;
export async function resolvePackage(primitive: string, versionHint: string): Promise<ResolvedPackage>;
```

### Modify

```typescript
// packages/limps-headless/src/fetcher/npm-registry.ts
// Add: queryUnifiedPackage() - check if radix-ui package exists and version >= 1.4.3

// packages/limps-headless/src/fetcher/unpkg.ts
// Add: fetchFromUnifiedPackage() - fetch types from radix-ui package path
```

---

## TDD Cycles

### 1. Detect unified package availability

```typescript
// Test
test('detectPackageSource returns "unified" when radix-ui >= 1.4.3', async () => {
  const source = await detectPackageSource('dialog');
  expect(source).toBe('unified');
});

test('detectPackageSource returns "individual" when radix-ui unavailable', async () => {
  // Mock npm registry to return 404 for radix-ui
  const source = await detectPackageSource('dialog');
  expect(source).toBe('individual');
});
```

Implementation:
- Query npm registry for `radix-ui` package
- Check if version >= 1.4.3
- Cache the result (unified package availability rarely changes)

### 2. Map primitive to unified export path

```typescript
// Test
test('resolvePackage maps dialog to correct unified path', async () => {
  const resolved = await resolvePackage('dialog', 'latest');
  expect(resolved).toEqual({
    source: 'unified',
    packageName: 'radix-ui',
    primitive: 'dialog',
    version: '1.4.3',
    typesPath: 'dist/dialog.d.ts' // or similar
  });
});
```

Implementation:
- Map primitive names to unified package export structure
- Handle naming differences between individual and unified packages

### 3. Fetch types from unified package CDN path

```typescript
// Test
test('fetchTypes uses unified package when available', async () => {
  const content = await fetchTypes('dialog', 'latest');
  expect(content).toContain('DialogRoot');
});
```

Implementation:
- Construct correct unpkg URL for unified package
- URL pattern: `https://unpkg.com/radix-ui@{version}/dist/{primitive}.d.ts`

### 4. Fallback to individual packages on failure

```typescript
// Test
test('fetchTypes falls back to individual package on unified failure', async () => {
  // Mock unified package fetch to fail
  const content = await fetchTypes('dialog', 'latest');
  expect(content).toContain('DialogRoot'); // Still works via @radix-ui/react-dialog
});
```

Implementation:
- Try unified package first
- On failure, fall back to `@radix-ui/react-{primitive}`
- Log which source was used

### 5. Cache package source detection

```typescript
// Test
test('package source detection is cached', async () => {
  await detectPackageSource('dialog');
  await detectPackageSource('popover');
  // Should only query npm once for radix-ui availability
  expect(mockNpmFetch).toHaveBeenCalledTimes(1);
});
```

Implementation:
- Cache unified package version at module level
- TTL of 1 hour for source detection cache

---

## Acceptance Criteria

- [ ] `radix_list_primitives` works with unified `radix-ui@1.4.3` package
- [ ] `radix_extract_primitive` fetches from unified package when available
- [ ] Falls back to individual packages gracefully
- [ ] Package source detection is cached
- [ ] All existing tests still pass
- [ ] New tests for unified package support added

---

## Notes

- The unified `radix-ui` package was introduced around mid-2024
- Individual `@radix-ui/react-*` packages are still maintained but unified is preferred
- runi and other modern projects use the unified package
