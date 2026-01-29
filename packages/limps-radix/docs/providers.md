---
title: limps-radix Providers
---

# Providers

Providers allow limps-radix to support different component libraries. Each provider implements a common interface and registers itself with the provider registry.

## ComponentLibraryProvider Interface

```typescript
export interface ComponentLibraryProvider {
  name: string;
  displayName: string;
  listPrimitives(version: string): Promise<string[]>;
  resolveVersion(versionHint: string): Promise<string>;
  fetchTypes(primitive: string, version: string): Promise<string>;
  extract?(typeContent: string): ExtractedPrimitive;
  generateSignature?(extracted: ExtractedPrimitive): BehaviorSignature;
}
```

## Registering a Provider

```typescript
import { registerProvider } from '@sudosandwich/limps-radix/providers';

registerProvider({
  name: 'acme',
  displayName: 'Acme UI',
  async listPrimitives() {
    return ['button', 'dialog'];
  },
  async resolveVersion(versionHint) {
    return versionHint === 'latest' ? '1.0.0' : versionHint;
  },
  async fetchTypes(primitive, version) {
    return `export interface ${primitive}Props {}`;
  },
});
```

## Notes

- Providers can optionally override `extract` and `generateSignature`.
- The default `radix` provider is registered automatically.
- Some tools (analysis and diff) may only support the `radix` provider for now.
