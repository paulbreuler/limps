/**
 * Type fetcher module for fetching Radix type definitions.
 */

export {
  resolveVersion,
  resolvePackageVersion,
  listPrimitives,
  primitiveToPackage,
  packageToPrimitive,
  fetchPackageInfo,
  KNOWN_PRIMITIVES,
  type KnownPrimitive,
} from './npm-registry.js';

export {
  detectPackageSource,
  resolvePackage,
  fetchTypesWithFallback,
  type PackageSource,
  type ResolvedPackage,
} from './unified-package.js';

export {
  fetchTypes,
  fetchFromUnifiedPackage,
  buildTypesUrl,
  fetchPackageFile,
} from './unpkg.js';
