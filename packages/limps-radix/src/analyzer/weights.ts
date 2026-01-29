/**
 * Scoring weights configuration for component analysis.
 * Defines how different aspects contribute to the confidence score.
 */

/**
 * Default scoring weights.
 * Total: 100 points
 */
export const DEFAULT_WEIGHTS = {
  statePattern: 35, // State pattern match (binary, single-value, etc.)
  composition: 25, // Composition pattern match (monolithic, compound, provider)
  propsSignature: 20, // Props signature match (distinguishing props)
  accessibility: 10, // Accessibility features (aria roles, data attributes)
  rendering: 10, // Rendering pattern match (inline, portal, etc.)
} as const;

/**
 * Scoring weights type.
 */
export type ScoringWeights = typeof DEFAULT_WEIGHTS;

/**
 * Get scoring weights (allows override for testing).
 */
export function getScoringWeights(
  customWeights?: Partial<ScoringWeights>
): ScoringWeights {
  return {
    ...DEFAULT_WEIGHTS,
    ...customWeights,
  };
}

/**
 * Validate that weights sum to 100.
 */
export function validateWeights(weights: ScoringWeights): boolean {
  const sum =
    weights.statePattern +
    weights.composition +
    weights.propsSignature +
    weights.accessibility +
    weights.rendering;
  return sum === 100;
}
