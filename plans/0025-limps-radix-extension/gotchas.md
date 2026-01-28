---
title: limps Radix Extension Gotchas
tags: [limps/gotchas, limps/issues]
created: 2026-01-26
updated: 2026-01-28
---

# Gotchas - limps-radix-extension

## Format

```markdown
### [GOTCHA-ID] Short title
**Discovered**: Date
**Severity**: Critical | High | Medium | Low
**Status**: Open | Resolved | Won't Fix

**Problem**: What went wrong

**Solution**: How to fix/workaround

**Affected**: Features/files affected
```

---

## Known Issues

### [GTC-001] limps extension API doesn't exist yet
**Discovered**: 2026-01-26
**Severity**: Critical
**Status**: Open

**Problem**: limps 2.0.0 doesn't have an extension system. We need to add `LimpsExtension` interface and extension loading to limps before limps-radix can work.

**Solution**: Agent 000 creates the extension API in limps repo first, then uses it in limps-radix.

**Affected**: All features depend on this.

---

### [GTC-002] Radix package structure variations
**Discovered**: 2026-01-26
**Severity**: Medium
**Status**: Open

**Problem**: Radix has multiple package structures:
- Individual packages: `@radix-ui/react-dialog`
- Meta package: `radix-ui` (since 2024)
- Some primitives have different export patterns

**Solution**: Type fetcher needs to handle both package structures. Check meta package first, fall back to individual.

**Affected**: #2 Type Fetcher

---

### [GTC-003] ts-morph bundle size
**Discovered**: 2026-01-26
**Severity**: Low
**Status**: Open

**Problem**: ts-morph is ~2MB which is heavy for a CLI tool.

**Solution**: Accept the size for now. If it becomes a problem, consider:
- Lazy loading ts-morph only when extraction needed
- Shipping pre-extracted signatures for common versions
- Native TypeScript API (more code, smaller bundle)

**Affected**: Bundle size

---

## Discovered During Development

### [GTC-004] Unified radix-ui package not supported
**Discovered**: 2026-01-28
**Severity**: High
**Status**: Resolved

**Problem**: limps-radix targets individual `@radix-ui/react-*` packages (e.g., `@radix-ui/react-dialog`), but modern projects like runi use the unified `radix-ui` package (v1.4.3+). The unified package has a different structure and export pattern.

**Solution**: Update the type fetcher to:
1. Detect which package structure is in use (`radix-ui` vs `@radix-ui/react-*`)
2. Fetch types from the unified package when applicable
3. Map primitive names to the unified package's export structure

**Affected**: #2 Type Fetcher, #7 radix_list_primitives, #8 radix_extract_primitive

---

### [GTC-005] Type extractor doesn't parse complex npm .d.ts files
**Discovered**: 2026-01-28
**Severity**: Medium
**Status**: Resolved (Agent 008)

**Problem**: The type extractor returns minimal data when parsing real npm type definitions that include:
- Complex imports (`import * as React from 'react'`)
- Type aliases and intersections
- Re-exported types from other packages
- JSDoc comments with `@default` values

Example: `radix_extract_primitive({ primitive: 'dialog' })` returns empty `subComponents: []` instead of Root, Trigger, Content, etc.

**Solution**: Improve the extractor to:
1. Resolve imported types (at least React types)
2. Follow type aliases to find the actual interface
3. Extract props from `ForwardRefExoticComponent` and similar patterns

**Affected**: #3 Extractor, #8 radix_extract_primitive

---
