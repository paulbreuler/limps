---
title: limps Radix Extension Gotchas
tags: [limps/gotchas, limps/issues]
created: 2026-01-26
updated: 2026-01-27
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

<!-- Add gotchas here as they're discovered -->
