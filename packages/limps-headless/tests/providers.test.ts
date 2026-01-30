/**
 * Tests for provider registry.
 */

import { describe, it, expect } from 'vitest';
import { getProvider, registerProvider } from '../src/providers/registry.js';
import type { ComponentLibraryProvider } from '../src/providers/interface.js';

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
