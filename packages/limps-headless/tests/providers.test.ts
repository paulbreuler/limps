/**
 * Tests for provider registry (Agent 1 #2 - extended with backend provider tests).
 */

import { describe, it, expect } from 'vitest';
import {
  getProvider,
  registerProvider,
  getBackendProvider,
  getAllBackendProviders,
} from '../src/providers/registry.js';
import type { ComponentLibraryProvider } from '../src/providers/interface.js';
import type { ComponentMetadata } from '../src/audit/types.js';

describe('provider registry', () => {
  it('returns the default radix provider', () => {
    const provider = getProvider('radix');
    expect(provider.name).toBe('radix');
    expect(provider.displayName).toBe('Radix UI');
  });

  it('registers and retrieves providers (case-insensitive)', () => {
    const customProvider: ComponentLibraryProvider = {
      name: 'Acme',
      displayName: 'Acme UI',
      listPrimitives: async () => ['button'],
      resolveVersion: async () => '1.0.0',
      fetchTypes: async () => 'type ButtonProps = {}',
    };

    registerProvider(customProvider);

    const provider = getProvider('acme');
    expect(provider.displayName).toBe('Acme UI');
  });

  it('throws with available providers when provider is unknown', () => {
    expect(() => getProvider('unknown')).toThrow(/Provider "unknown" is not registered/);
    expect(() => getProvider('unknown')).toThrow(/Available:/);
  });

  it('throws on duplicate provider registration', () => {
    const dupeProvider: ComponentLibraryProvider = {
      name: 'duplicate',
      displayName: 'Duplicate UI',
      listPrimitives: async () => [],
      resolveVersion: async () => '1.0.0',
      fetchTypes: async () => '',
    };

    registerProvider(dupeProvider);
    expect(() => registerProvider(dupeProvider)).toThrow(
      'Provider "duplicate" is already registered'
    );
  });
});

// Test ID: provider-registry
describe('provider-registry (backend)', () => {
  it('returns all registered backend providers', () => {
    const providers = getAllBackendProviders();
    expect(providers.length).toBeGreaterThanOrEqual(2);
    expect(providers.map((p) => p.id).sort()).toEqual(['base', 'radix']);
  });

  it('retrieves radix backend provider', () => {
    const provider = getBackendProvider('radix');
    expect(provider).toBeDefined();
    expect(provider?.id).toBe('radix');
    expect(provider?.label).toContain('Radix');
  });

  it('retrieves base backend provider', () => {
    const provider = getBackendProvider('base');
    expect(provider).toBeDefined();
    expect(provider?.id).toBe('base');
    expect(provider?.label).toContain('Base');
  });

  it('returns undefined for unknown backend', () => {
    const provider = getBackendProvider('unknown');
    expect(provider).toBeUndefined();
  });
});

// Test ID: provider-radix
describe('provider-radix (backend)', () => {
  it('detects Radix imports', () => {
    const provider = getBackendProvider('radix')!;
    expect(provider.detectImports(['@radix-ui/react-dialog'])).toBe(true);
    expect(provider.detectImports(['@radix-ui/react-select'])).toBe(true);
    expect(provider.detectImports(['@radix-ui/primitive'])).toBe(true);
    expect(provider.detectImports(['react', 'lodash'])).toBe(false);
  });

  it('detects Radix patterns', () => {
    const provider = getBackendProvider('radix')!;
    expect(provider.detectPatterns(['asChild'])).toBe(true);
    expect(provider.detectPatterns(['render', 'onClick'])).toBe(false);
  });

  it('is marked as deprecated', () => {
    const provider = getBackendProvider('radix')!;
    expect(provider.deprecated).toBe(true);
  });

  it('analyzes Radix component and returns deprecation issue', () => {
    const provider = getBackendProvider('radix')!;
    const component: ComponentMetadata = {
      path: 'src/components/Dialog.tsx',
      name: 'Dialog',
      backend: 'radix',
      mixedUsage: false,
      importSources: ['@radix-ui/react-dialog'],
      evidence: ['asChild'],
      exportsComponent: true,
      exportedNames: ['Dialog'],
    };

    const issues = provider.analyzeComponent(component);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.category === 'dependencies')).toBe(true);
    expect(issues.some((i) => i.message.includes('legacy'))).toBe(true);
  });

  it('analyzes project with Radix components', () => {
    const provider = getBackendProvider('radix')!;
    const components: ComponentMetadata[] = [
      {
        path: 'src/components/Dialog.tsx',
        name: 'Dialog',
        backend: 'radix',
        mixedUsage: false,
        importSources: ['@radix-ui/react-dialog'],
        evidence: [],
        exportsComponent: true,
        exportedNames: ['Dialog'],
      },
      {
        path: 'src/components/Select.tsx',
        name: 'Select',
        backend: 'radix',
        mixedUsage: false,
        importSources: ['@radix-ui/react-select'],
        evidence: [],
        exportsComponent: true,
        exportedNames: ['Select'],
      },
    ];

    const issues = provider.analyzeProject(components);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.message.includes('Radix UI'))).toBe(true);
  });
});

// Test ID: provider-base
describe('provider-base (backend)', () => {
  it('detects Base UI imports', () => {
    const provider = getBackendProvider('base')!;
    expect(provider.detectImports(['@base-ui-components/react'])).toBe(true);
    expect(provider.detectImports(['@base_ui/react'])).toBe(true);
    expect(provider.detectImports(['react', '@radix-ui/react-dialog'])).toBe(false);
  });

  it('detects Base UI patterns', () => {
    const provider = getBackendProvider('base')!;
    expect(provider.detectPatterns(['render'])).toBe(true);
    expect(provider.detectPatterns(['asChild', 'onClick'])).toBe(false);
  });

  it('is not marked as deprecated', () => {
    const provider = getBackendProvider('base')!;
    expect(provider.deprecated).toBe(false);
  });

  it('analyzes mixed usage component and returns issue', () => {
    const provider = getBackendProvider('base')!;
    const component: ComponentMetadata = {
      path: 'src/components/Mixed.tsx',
      name: 'Mixed',
      backend: 'mixed',
      mixedUsage: true,
      importSources: ['@base-ui-components/react', '@radix-ui/react-dialog'],
      evidence: ['render', 'asChild'],
      exportsComponent: true,
      exportedNames: ['Mixed'],
    };

    const issues = provider.analyzeComponent(component);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.category === 'migration')).toBe(true);
    expect(issues.some((i) => i.message.includes('both Radix and Base'))).toBe(true);
  });

  it('analyzes project with mixed components', () => {
    const provider = getBackendProvider('base')!;
    const components: ComponentMetadata[] = [
      {
        path: 'src/components/Base.tsx',
        name: 'BaseComponent',
        backend: 'base',
        mixedUsage: false,
        importSources: ['@base-ui-components/react'],
        evidence: ['render'],
        exportsComponent: true,
        exportedNames: ['BaseComponent'],
      },
      {
        path: 'src/components/Mixed.tsx',
        name: 'MixedComponent',
        backend: 'mixed',
        mixedUsage: true,
        importSources: ['@base-ui-components/react', '@radix-ui/react-dialog'],
        evidence: [],
        exportsComponent: true,
        exportedNames: ['MixedComponent'],
      },
    ];

    const issues = provider.analyzeProject(components);
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.some((i) => i.message.includes('mixed'))).toBe(true);
  });
});
