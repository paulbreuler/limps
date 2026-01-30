/**
 * Disambiguator for resolving ambiguous matches.
 * Detects when top matches are too close and applies domain rules to resolve.
 */

import type { ComponentAnalysis, PrimitiveMatch } from '../types/index.js';
import {
  getDisambiguationRule,
  getDisambiguationRuleForGroup,
} from './rules/index.js';

/**
 * Check if matches are ambiguous (top 2 within 10 points).
 */
export function isAmbiguous(matches: PrimitiveMatch[]): boolean {
  if (matches.length < 2) {
    return false;
  }

  const topScore = matches[0].confidence;
  const secondScore = matches[1].confidence;

  return topScore - secondScore <= 10;
}

/**
 * Disambiguate ambiguous matches using domain rules.
 * Returns the best match after applying disambiguation rules.
 */
export function disambiguate(
  matches: PrimitiveMatch[],
  analysis: ComponentAnalysis
): PrimitiveMatch {
  if (matches.length === 0) {
    throw new Error('Cannot disambiguate empty matches');
  }

  // If not ambiguous, return top match
  if (!isAmbiguous(matches)) {
    return matches[0];
  }

  // Get top 2 matches
  const topMatch = matches[0];
  const secondMatch = matches[1];

  // Try group-based disambiguation first (for 3+ primitives or special groups)
  if (matches.length >= 2) {
    const primitives = matches.slice(0, Math.min(3, matches.length)).map((m) => m.primitive);
    const groupRule = getDisambiguationRuleForGroup(primitives);
    if (groupRule) {
      const result = groupRule(analysis);
      if (result) {
        const preferredMatch = matches.find((m) => m.primitive === result);
        if (preferredMatch) {
          return preferredMatch;
        }
      }
    }
  }

  // Try to find a disambiguation rule for the pair
  const rule = getDisambiguationRule(
    topMatch.primitive,
    secondMatch.primitive
  );

  if (rule) {
    const result = rule(analysis);
    if (result) {
      // Find the match that matches the rule result
      const preferredMatch = matches.find((m) => m.primitive === result);
      if (preferredMatch) {
        return preferredMatch;
      }
    }
  }

  // No rule found or rule couldn't disambiguate
  // Return top match (highest confidence)
  return topMatch;
}

/**
 * Get disambiguation reasoning for a match.
 * Returns a human-readable explanation of why a match was chosen.
 */
export function getDisambiguationReasoning(
  matches: PrimitiveMatch[],
  _analysis: ComponentAnalysis,
  chosenMatch: PrimitiveMatch
): string | undefined {
  if (!isAmbiguous(matches)) {
    return undefined;
  }

  const topMatch = matches[0];
  const secondMatch = matches[1];

  // If chosen match is not the top match, explain why
  if (chosenMatch.primitive !== topMatch.primitive) {
    const rule = getDisambiguationRule(
      topMatch.primitive,
      secondMatch.primitive
    );

    if (rule) {
      // Try to get a human-readable reason
      // For now, return a generic message
      return `Disambiguated from ${topMatch.primitive} using domain rules`;
    }
  }

  return undefined;
}
