import type { Evidence } from '../analysis/ir/types.js';

export type RuleSeverity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type Condition =
  | { evidenceId: string }
  | { importSource: string }
  | { jsxElement: string }
  | { role: string }
  | { dataAttr: string }
  | { behavior: string }
  | { typeRef: string };

export interface Predicate {
  any?: Condition[];
  all?: Condition[];
  not?: Condition;
}

export interface Rule {
  id: string;
  title: string;
  description: string;
  severity: RuleSeverity;
  weight: number;
  predicate: Predicate;
  tags?: string[];
}

export interface Ruleset {
  id: string;
  name: string;
  description: string;
  version: string;
  rules: Rule[];
  thresholds: {
    strong: number;
    possible: number;
  };
}

export type Classification = 'strong' | 'possible' | 'none';

export interface RuleMatch {
  ruleId: string;
  matched: boolean;
  score: number;
  evidenceIds: string[];
}

export interface EvaluationResult {
  classification: Classification;
  confidence: number;
  score: number;
  matches: RuleMatch[];
  evidence: Evidence[];
}
