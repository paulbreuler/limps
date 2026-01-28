---
title: Complex Type Parsing
status: PASS
persona: coder
dependencies:
  - "001"
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#008", "Complex Parsing Agent"]
created: 2026-01-28
updated: 2026-01-28
files:
  - path: packages/limps-radix/src/extractor/type-resolver.ts
    action: create
  - path: packages/limps-radix/src/extractor/forward-ref.ts
    action: create
  - path: packages/limps-radix/src/extractor/interface.ts
    action: modify
  - path: packages/limps-radix/src/extractor/props.ts
    action: modify
  - path: packages/limps-radix/tests/extractor-complex.test.ts
    action: create
---

# Agent 008: Complex Type Parsing (GTC-005)

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #20 (Complex Type Parsing)
Own: `packages/limps-radix/src/extractor/type-resolver.ts`, `packages/limps-radix/src/extractor/forward-ref.ts`
Depend on: Agent 001 for existing extractor infrastructure
Block: None (enhancement)

## Problem

The type extractor returns minimal data when parsing real npm type definitions that include:
- Complex imports (`import * as React from 'react'`)
- Type aliases and intersections
- Re-exported types from other packages
- JSDoc comments with `@default` values

Example: `radix_extract_primitive({ primitive: 'dialog' })` returns empty `subComponents: []` instead of Root, Trigger, Content, etc.

See: `gotchas.md#GTC-005`

## Interfaces

### Export

```typescript
// packages/limps-radix/src/extractor/forward-ref.ts
export function extractPropsFromForwardRef(
  decl: TypeAliasDeclaration | VariableDeclaration
): RawProp[] | null;

// packages/limps-radix/src/extractor/type-resolver.ts
export function resolveTypeAlias(
  sourceFile: SourceFile,
  aliasName: string
): InterfaceDeclaration | TypeLiteralNode | null;

export function mergeIntersectionTypes(
  types: Type[]
): RawProp[];

export function filterReactInternals(props: RawProp[]): RawProp[];
```

### Modify

```typescript
// packages/limps-radix/src/extractor/interface.ts
// Enhance: Use type resolver when interface not found directly

// packages/limps-radix/src/extractor/props.ts
// Enhance: Handle ForwardRefExoticComponent patterns
```

---

## TDD Cycles

### 1. Find ForwardRefExoticComponent declarations

```typescript
// Test
test('finds ForwardRefExoticComponent type declarations', () => {
  const source = `
    export const DialogRoot: React.ForwardRefExoticComponent<
      DialogRootProps & React.RefAttributes<HTMLDivElement>
    >;
  `;
  const declarations = findForwardRefDeclarations(source);
  expect(declarations).toHaveLength(1);
  expect(declarations[0].name).toBe('DialogRoot');
});
```

Implementation:
- Find variable declarations with ForwardRefExoticComponent type
- Extract the component name from the declaration

### 2. Extract props from ForwardRef type parameter

```typescript
// Test
test('extracts props from ForwardRef type parameter', () => {
  const source = `
    interface DialogRootProps {
      open?: boolean;
      onOpenChange?: (open: boolean) => void;
    }
    export const DialogRoot: React.ForwardRefExoticComponent<
      DialogRootProps & React.RefAttributes<HTMLDivElement>
    >;
  `;
  const props = extractPropsFromForwardRef(parseDeclaration(source, 'DialogRoot'));
  expect(props).toContainEqual(expect.objectContaining({ name: 'open' }));
  expect(props).toContainEqual(expect.objectContaining({ name: 'onOpenChange' }));
});
```

Implementation:
- Parse the type argument of ForwardRefExoticComponent
- If it's an intersection, split into parts
- Find the props interface/type reference
- Extract properties from that interface

### 3. Resolve type aliases to underlying interfaces

```typescript
// Test
test('resolves type alias to interface', () => {
  const source = `
    interface BaseDialogProps { open?: boolean; }
    type DialogProps = BaseDialogProps & { modal?: boolean; };
  `;
  const resolved = resolveTypeAlias(parseSource(source), 'DialogProps');
  expect(resolved.members).toHaveLength(2);
});
```

Implementation:
- Find the type alias declaration
- If it references an interface, return that interface
- If it's an intersection/union, resolve each part
- Handle re-exports by following import chains

### 4. Handle intersection types (merge members, filter React internals)

```typescript
// Test
test('merges intersection type members', () => {
  const source = `
    type DialogRootProps = BaseProps & { open?: boolean } & React.HTMLAttributes<HTMLDivElement>;
  `;
  const props = mergeIntersectionTypes(parseIntersection(source));
  expect(props.find(p => p.name === 'open')).toBeDefined();
});

test('filters React internal props', () => {
  const props = [
    { name: 'open', type: 'boolean' },
    { name: 'ref', type: 'React.Ref<HTMLDivElement>' },
    { name: 'key', type: 'React.Key' },
    { name: 'children', type: 'React.ReactNode' },
  ];
  const filtered = filterReactInternals(props);
  expect(filtered).toHaveLength(2); // open, children (keep children)
  expect(filtered.find(p => p.name === 'ref')).toBeUndefined();
  expect(filtered.find(p => p.name === 'key')).toBeUndefined();
});
```

Implementation:
- Recursively resolve each part of intersection
- Merge all properties into single list
- Filter out React internals: `ref`, `key`, internal event handlers
- Keep `children` as it's compositionally relevant

### 5. Detect sub-components from export declarations

```typescript
// Test
test('detects sub-components from named exports', () => {
  const source = `
    export const Dialog: typeof DialogRoot;
    export const DialogTrigger: React.ForwardRefExoticComponent<...>;
    export const DialogContent: React.ForwardRefExoticComponent<...>;
    export const DialogOverlay: React.ForwardRefExoticComponent<...>;
  `;
  const subComponents = detectSubComponents(parseSource(source), 'Dialog');
  expect(subComponents).toEqual(['Root', 'Trigger', 'Content', 'Overlay']);
});
```

Implementation:
- Find all exports starting with the primitive name
- Extract the suffix as sub-component name
- Handle both `export const` and `export { X as Y }` patterns

---

## Acceptance Criteria

- [ ] `radix_extract_primitive({ primitive: 'dialog' })` returns populated `subComponents[]`
- [ ] Sub-components include: Root, Trigger, Content, Overlay, Portal, Title, Description, Close
- [ ] Props are correctly extracted from ForwardRefExoticComponent types
- [ ] Type aliases are resolved to their underlying interfaces
- [ ] React internal props (ref, key) are filtered out
- [ ] All existing tests still pass
- [ ] New tests for complex parsing added

---

## Real-World .d.ts Patterns

### Pattern 1: ForwardRefExoticComponent

```typescript
// Common in Radix UI
export const DialogRoot: React.ForwardRefExoticComponent<
  DialogRootProps & React.RefAttributes<HTMLDivElement>
>;
```

### Pattern 2: Type Alias with Intersection

```typescript
type DialogContentProps = DialogContentImplProps & {
  forceMount?: true;
};
```

### Pattern 3: Re-exported Types

```typescript
// In index.d.ts
export { DialogProps } from './Dialog';
export { type DialogRootProps } from './DialogRoot';
```

### Pattern 4: Props Extending Primitive

```typescript
interface DialogContentProps extends Primitive.DivProps {
  onOpenAutoFocus?: (event: Event) => void;
}
```

---

## Notes

- ts-morph's `Type.getProperties()` can help resolve intersection types
- Use `getTypeAtLocation()` to resolve type aliases
- Consider caching resolved types per source file for performance
