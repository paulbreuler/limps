/**
 * Provider registry for component libraries.
 */

import type { ComponentLibraryProvider, ProviderRegistry } from './interface.js';
import { radixProvider } from './radix.js';

const providers: ProviderRegistry = new Map();

function normalizeProviderName(name: string): string {
  return name.trim().toLowerCase();
}

export function registerProvider(provider: ComponentLibraryProvider): void {
  const key = normalizeProviderName(provider.name);
  if (providers.has(key)) {
    throw new Error(`Provider "${provider.name}" is already registered`);
  }
  providers.set(key, provider);
}

export function getProvider(name: string): ComponentLibraryProvider {
  const key = normalizeProviderName(name);
  const provider = providers.get(key);
  if (!provider) {
    throw new Error(`Provider "${name}" is not registered`);
  }
  return provider;
}

export { providers };

registerProvider(radixProvider);
