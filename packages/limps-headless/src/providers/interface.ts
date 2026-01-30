/**
 * Provider interface for component library integrations.
 */

import type { ExtractedPrimitive, BehaviorSignature } from '../types/index.js';

/**
 * Component library provider interface.
 */
export interface ComponentLibraryProvider {
  name: string;
  displayName: string;
  listPrimitives(version: string): Promise<string[]>;
  resolveVersion(versionHint: string): Promise<string>;
  fetchTypes(primitive: string, version: string): Promise<string>;
  extract?(typeContent: string): ExtractedPrimitive;
  generateSignature?(extracted: ExtractedPrimitive): BehaviorSignature;
}

export type ProviderRegistry = Map<string, ComponentLibraryProvider>;
