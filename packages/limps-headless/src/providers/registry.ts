/**
 * Provider registry for component libraries (Agent 1 #2 - extended with backend providers).
 */

import type {
  ComponentLibraryProvider,
  ProviderRegistry,
  BackendProvider,
  BackendProviderRegistry,
} from './interface.js';
import type { HeadlessBackend } from '../audit/types.js';
import { radixProvider } from './radix.js';
import { radixBackendProvider } from './radix-backend.js';
import { baseProvider } from './base.js';

// --- Component Library Providers (for type fetching) ---

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

export function getProviderNames(): string[] {
  return [...providers.keys()];
}

export function getProvider(name: string): ComponentLibraryProvider {
  const key = normalizeProviderName(name);
  const provider = providers.get(key);
  if (!provider) {
    const available = getProviderNames().length > 0 ? getProviderNames().join(', ') : 'none';
    throw new Error(`Provider "${name}" is not registered. Available: ${available}`);
  }
  return provider;
}

export { providers };

// Register component library providers
registerProvider(radixProvider);

// --- Backend Providers (for detection and analysis) ---

const backendProviders: BackendProviderRegistry = new Map();

export function registerBackendProvider(provider: BackendProvider): void {
  if (backendProviders.has(provider.id)) {
    throw new Error(`Backend provider "${provider.id}" is already registered`);
  }
  backendProviders.set(provider.id, provider);
}

export function getBackendProviderIds(): HeadlessBackend[] {
  return [...backendProviders.keys()];
}

export function getBackendProvider(id: HeadlessBackend): BackendProvider | undefined {
  return backendProviders.get(id);
}

export function getAllBackendProviders(): BackendProvider[] {
  return [...backendProviders.values()];
}

export { backendProviders };

// Register backend providers
registerBackendProvider(radixBackendProvider);
registerBackendProvider(baseProvider);
