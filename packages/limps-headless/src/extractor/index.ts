/**
 * Type extractor module for parsing Radix type definitions.
 */

import type { ExtractedPrimitive, PropDefinition, RawProp } from '../types/index.js';
import { parseTypes } from './project.js';
import { extractPrimitiveFromSource } from './interface.js';
import { primitiveToPackage } from '../fetcher/npm-registry.js';

// Re-export utilities
export { createProject, createSourceFile, parseTypes } from './project.js';
export {
  findInterfaces,
  findPropsInterfaces,
  extractSubComponents,
  extractSubComponentsEnhanced,
  findExports,
  detectContextUsage,
  extractContextShape,
  extractPrimitiveFromSource,
} from './interface.js';
export {
  findForwardRefDeclarations,
  extractPropsFromForwardRef,
  getSubComponentSuffix,
} from './forward-ref.js';
export {
  resolveTypeAlias,
  mergeIntersectionTypes,
  filterReactInternals,
  resolveTypeReference,
} from './type-resolver.js';
export {
  extractPropsFromInterface,
  extractProp,
  isPropsInterface,
  componentNameFromProps,
} from './props.js';
export { extractJsDoc, extractDefaultFromComment } from './jsdoc.js';
export {
  classifyProp,
  isStateControl,
  isEventHandler,
  isComposition,
  isConfiguration,
  getPropCategory,
} from './classifier.js';

/**
 * Extract primitive information from type content.
 *
 * @param typeContent - The .d.ts file content
 * @param primitiveName - The primitive name (e.g., "Dialog")
 * @param version - The package version
 * @returns ExtractedPrimitive with full type information
 */
export function extractPrimitive(
  typeContent: string,
  primitiveName: string,
  version: string = 'unknown',
  packageName?: string
): ExtractedPrimitive {
  const sourceFile = parseTypes(typeContent);
  const resolvedPackageName = packageName ?? primitiveToPackage(primitiveName.toLowerCase());

  return extractPrimitiveFromSource(sourceFile, primitiveName, resolvedPackageName, version);
}

/**
 * Classify an array of raw props into full PropDefinitions.
 */
export function classifyProps(rawProps: RawProp[]): PropDefinition[] {
  return rawProps.map((raw) => ({
    ...raw,
    isStateControl:
      raw.name === 'open' ||
      raw.name === 'value' ||
      raw.name === 'checked' ||
      raw.name.startsWith('default'),
    isEventHandler: /^on[A-Z]/.test(raw.name),
    isConfiguration: ['modal', 'orientation', 'side', 'align'].includes(raw.name),
    isComposition: raw.name === 'asChild' || raw.name === 'children',
  }));
}
