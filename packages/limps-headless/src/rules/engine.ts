import type { ComponentIR } from '../analysis/ir/types.js';
import type { EvaluationResult, RuleMatch, Ruleset } from './types.js';
import { evaluatePredicate } from './predicates.js';

export function evaluateRuleset(ir: ComponentIR, ruleset: Ruleset): EvaluationResult {
  let score = 0;
  const matches: RuleMatch[] = [];

  for (const rule of ruleset.rules) {
    const result = evaluatePredicate(ir, rule.predicate);
    const matched = result.matched;
    const ruleScore = matched ? rule.weight : 0;
    if (matched) {
      score += ruleScore;
    }
    matches.push({
      ruleId: rule.id,
      matched,
      score: ruleScore,
      evidenceIds: result.evidenceIds,
    });
  }

  let classification: EvaluationResult['classification'] = 'none';
  if (score >= ruleset.thresholds.strong) {
    classification = 'strong';
  } else if (score >= ruleset.thresholds.possible) {
    classification = 'possible';
  }

  const confidence =
    ruleset.thresholds.strong > 0
      ? Math.min(1, score / ruleset.thresholds.strong)
      : 0;

  return {
    classification,
    confidence,
    score,
    matches,
    evidence: ir.evidence,
  };
}
