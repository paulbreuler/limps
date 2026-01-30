/**
 * Provider interface for component library integrations.
 */

import type { ExtractedPrimitive, BehaviorSignature } from '../types/index.js';
import type { ComponentMetadata, Issue, HeadlessBackend } from '../audit/types.js';

/**
 * Component library provider interface (for type fetching).
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

/**
 * Backend provider interface for detection and analysis (Agent 1 #2).
 * Providers supply backend-specific rules and metadata.
 */
export interface BackendProvider {
  /** Backend identifier. */
  id: HeadlessBackend;
  /** Human-readable label. */
  label: string;
  /** True if this backend is deprecated (e.g., Radix legacy). */
  deprecated?: boolean;

  /**
   * Detect if imports indicate this backend.
   * @param imports - Array of import source strings.
   * @returns True if any import matches this backend.
   */
  detectImports(imports: string[]): boolean;

  /**
   * Detect if pattern evidence indicates this backend.
   * @param evidence - Array of evidence strings (e.g., "asChild", "render").
   * @returns True if any evidence matches this backend.
   */
  detectPatterns(evidence: string[]): boolean;

  /**
   * Analyze a single component for issues.
   * @param component - Component metadata to analyze.
   * @returns Array of issues found.
   */
  analyzeComponent(component: ComponentMetadata): Issue[];

  /**
   * Analyze the entire project for cross-component issues.
   * @param components - All discovered components.
   * @returns Array of project-level issues.
   */
  analyzeProject(components: ComponentMetadata[]): Issue[];
}

export type BackendProviderRegistry = Map<HeadlessBackend, BackendProvider>;
