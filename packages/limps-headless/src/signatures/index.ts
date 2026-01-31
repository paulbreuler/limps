/**
 * Signature generation module for Radix primitives.
 *
 * Transforms ExtractedPrimitive data into BehaviorSignature contracts.
 */

export {
  inferStatePattern,
  inferCompositionPattern,
  inferRenderingPattern,
} from './inference.js';

export {
  getDistinguishingProps,
  getAntiPatternProps,
  getKnownPrimitives,
  isKnownPrimitive,
} from './distinguishing.js';

export {
  getSimilarPrimitives,
  getDisambiguationRule,
  getSimilarityGroup,
  areSimilar,
} from './disambiguation.js';

export { generateSignature, generateSignatures } from './generator.js';
