/**
 * Confidence scoring for component analysis.
 * Scores components against Radix signatures using weighted dimensions.
 */

import type {
  ComponentAnalysis,
  PrimitiveMatch,
  BehaviorSignature,
  PropDefinition,
} from '../types/index.js';
import { getScoringWeights, type ScoringWeights } from './weights.js';

/**
 * Score a component analysis against a Radix signature.
 * Returns a PrimitiveMatch with confidence score and breakdown.
 */
export function scoreAgainstSignatures(
  analysis: ComponentAnalysis,
  signatures: BehaviorSignature[],
  weights?: Partial<ScoringWeights>
): PrimitiveMatch[] {
  const scoringWeights = getScoringWeights(weights);
  const matches: PrimitiveMatch[] = [];

  for (const signature of signatures) {
    const match = scoreComponent(analysis, signature, scoringWeights);
    matches.push(match);
  }

  // Sort by confidence (descending)
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

/**
 * Score a single component against a signature.
 */
function scoreComponent(
  analysis: ComponentAnalysis,
  signature: BehaviorSignature,
  weights: ScoringWeights
): PrimitiveMatch {
  const breakdown = {
    statePatternScore: scoreStatePattern(
      analysis.inferredStatePattern,
      signature.statePattern,
      weights.statePattern
    ),
    compositionScore: scoreComposition(
      analysis.inferredCompositionPattern,
      signature.compositionPattern,
      weights.composition
    ),
    propsSignatureScore: scorePropsSignature(
      analysis.propsInterface,
      signature,
      weights.propsSignature
    ),
    accessibilityScore: scoreAccessibility(
      analysis.ariaRoles,
      analysis.dataAttributes,
      signature,
      weights.accessibility
    ),
    renderingScore: scoreRendering(
      analysis.inferredRenderingPattern,
      signature.renderingPattern,
      weights.rendering
    ),
  };

  // Calculate total confidence
  let confidence =
    breakdown.statePatternScore +
    breakdown.compositionScore +
    breakdown.propsSignatureScore +
    breakdown.accessibilityScore +
    breakdown.renderingScore;

  // Apply anti-pattern penalty
  const antiPatternPenalty = calculateAntiPatternPenalty(
    analysis.propsInterface,
    signature.antiPatternProps
  );
  confidence = Math.max(0, confidence - antiPatternPenalty);

  // Collect signals
  const signals = collectSignals(analysis, signature);

  return {
    primitive: signature.primitive,
    package: signature.package,
    confidence: Math.round(confidence),
    breakdown,
    signals,
  };
}

/**
 * Score state pattern match (0 to maxScore).
 */
function scoreStatePattern(
  inferred: ComponentAnalysis['inferredStatePattern'],
  expected: BehaviorSignature['statePattern'],
  maxScore: number
): number {
  if (inferred === expected) {
    return maxScore;
  }
  return 0;
}

/**
 * Score composition pattern match (0 to maxScore).
 */
function scoreComposition(
  inferred: ComponentAnalysis['inferredCompositionPattern'],
  expected: BehaviorSignature['compositionPattern'],
  maxScore: number
): number {
  if (inferred === expected) {
    return maxScore;
  }
  return 0;
}

/**
 * Score props signature match (0 to maxScore).
 * Checks for distinguishing props and gives partial credit.
 */
function scorePropsSignature(
  props: Map<string, PropDefinition>,
  signature: BehaviorSignature,
  maxScore: number
): number {
  const distinguishingProps = signature.distinguishingProps;
  if (distinguishingProps.length === 0) {
    // No distinguishing props to check, return neutral score
    return 0;
  }

  let matchedCount = 0;
  for (const propName of distinguishingProps) {
    if (props.has(propName)) {
      matchedCount++;
    }
  }

  // Proportional score based on how many distinguishing props match
  return Math.round((matchedCount / distinguishingProps.length) * maxScore);
}

/**
 * Score accessibility features (0 to maxScore).
 * Checks for aria roles and data attributes that match expected patterns.
 */
function scoreAccessibility(
  ariaRoles: string[],
  dataAttributes: string[],
  _signature: BehaviorSignature,
  maxScore: number
): number {
  // Basic scoring: if component has accessibility features, give partial credit
  // More sophisticated scoring could check for specific roles/attributes
  if (ariaRoles.length > 0 || dataAttributes.length > 0) {
    // Give partial credit for having accessibility features
    return Math.round(maxScore * 0.5);
  }

  return 0;
}

/**
 * Score rendering pattern match (0 to maxScore).
 */
function scoreRendering(
  inferred: ComponentAnalysis['inferredRenderingPattern'],
  expected: BehaviorSignature['renderingPattern'],
  maxScore: number
): number {
  if (inferred === expected) {
    return maxScore;
  }
  return 0;
}

/**
 * Calculate anti-pattern penalty.
 * Returns penalty points to subtract from total score.
 */
function calculateAntiPatternPenalty(
  props: Map<string, PropDefinition>,
  antiPatternProps: string[]
): number {
  let penalty = 0;

  for (const antiProp of antiPatternProps) {
    if (props.has(antiProp)) {
      // Each anti-pattern prop reduces score by 10 points
      penalty += 10;
    }
  }

  return penalty;
}

/**
 * Collect signals (matched, missing, anti-patterns) for debugging.
 */
function collectSignals(
  analysis: ComponentAnalysis,
  signature: BehaviorSignature
): PrimitiveMatch['signals'] {
  const matched: string[] = [];
  const missing: string[] = [];
  const antiPatterns: string[] = [];

  // Check distinguishing props
  for (const propName of signature.distinguishingProps) {
    if (analysis.propsInterface.has(propName)) {
      matched.push(`prop:${propName}`);
    } else {
      missing.push(`prop:${propName}`);
    }
  }

  // Check patterns
  if (analysis.inferredStatePattern === signature.statePattern) {
    matched.push(`state:${signature.statePattern}`);
  } else {
    missing.push(`state:${signature.statePattern}`);
  }

  if (analysis.inferredCompositionPattern === signature.compositionPattern) {
    matched.push(`composition:${signature.compositionPattern}`);
  } else {
    missing.push(`composition:${signature.compositionPattern}`);
  }

  if (analysis.inferredRenderingPattern === signature.renderingPattern) {
    matched.push(`rendering:${signature.renderingPattern}`);
  } else {
    missing.push(`rendering:${signature.renderingPattern}`);
  }

  // Check anti-patterns
  for (const antiProp of signature.antiPatternProps) {
    if (analysis.propsInterface.has(antiProp)) {
      antiPatterns.push(antiProp);
    }
  }

  return {
    matched,
    missing,
    antiPatterns,
  };
}
