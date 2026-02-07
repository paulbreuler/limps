/**
 * Radix UI provider implementation.
 */

import type { ComponentLibraryProvider } from './interface.js';
import { resolvePackage, fetchTypesWithFallback, listPrimitives } from '../fetcher/index.js';

export const radixProvider: ComponentLibraryProvider = {
  name: 'radix',
  displayName: 'Radix UI',

  async listPrimitives(version: string): Promise<string[]> {
    const primitives = await listPrimitives(version);
    return primitives.map((p) => p.name);
  },

  async resolveVersion(versionHint: string): Promise<string> {
    const resolved = await resolvePackage('dialog', versionHint);
    return resolved.version;
  },

  async fetchTypes(primitive: string, version: string): Promise<string> {
    const content = await fetchTypesWithFallback(primitive, version);
    return content.content;
  },
};
