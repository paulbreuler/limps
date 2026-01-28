/**
 * Type fetcher module for fetching Radix type definitions.
 */

export {
  resolveVersion,
  listPrimitives,
  primitiveToPackage,
  packageToPrimitive,
  fetchPackageInfo,
  KNOWN_PRIMITIVES,
  type KnownPrimitive,
} from './npm-registry.js';

export { fetchTypes, buildTypesUrl, fetchPackageFile } from './unpkg.js';
