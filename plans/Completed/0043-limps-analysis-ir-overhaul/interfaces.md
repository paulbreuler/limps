# Interfaces - limps Analysis IR Overhaul

## Component IR

```typescript
export type EvidenceSource =
  | 'import'
  | 'jsx'
  | 'props'
  | 'types'
  | 'role'
  | 'data-attr'
  | 'behavior'
  | 'module-graph'
  | 'config';

export type EvidenceStrength = 'strong' | 'possible' | 'weak';

export interface EvidenceLocation {
  file: string;
  line: number;
  column: number;
}

export interface Evidence {
  id: string; // e.g. import:base-ui:tabs
  source: EvidenceSource;
  strength: EvidenceStrength;
  weight: number;
  location?: EvidenceLocation;
  notes?: string;
}

export interface ImportSpec {
  source: string;
  named: string[];
  defaultName?: string;
  namespace?: string;
}

export interface JsxEvidence {
  elements: string[];
  attributes: string[];
  roles: string[];
  dataAttrs: string[];
}

export interface BehaviorEvidence {
  behaviors: string[]; // e.g. roving-tabindex, portal, focus-trap
  handlers: string[];  // e.g. onKeyDown, onFocus
}

export interface ComponentIR {
  id: string;
  filePath: string;
  exportName: string;
  localName: string;
  imports: ImportSpec[];
  jsx: JsxEvidence;
  behaviors: BehaviorEvidence;
  evidence: Evidence[];
  dependencies: string[]; // component ids
  reexports: string[];    // component ids
}
```

## Rules + Rulesets

```typescript
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
```

## Evaluation Results

```typescript
export type Classification = 'strong' | 'possible' | 'none';

export interface RuleMatch {
  ruleId: string;
  matched: boolean;
  score: number;
  evidenceIds: string[];
}

export interface EvaluationResult {
  classification: Classification;
  confidence: number; // 0..1
  score: number;
  matches: RuleMatch[];
  evidence: Evidence[];
}
```

## Analyzer + Audit Outputs

```typescript
export interface AnalyzeOptions {
  tsconfigPath?: string;
  ruleset?: string; // base-ui | radix-legacy
  evidence?: 'summary' | 'verbose';
  debugIr?: boolean;
}

export interface AnalyzeResult {
  componentId: string;
  filePath: string;
  classification: Classification;
  confidence: number;
  evidence: Evidence[];
  matches: RuleMatch[];
}

export interface AuditSummary {
  totalComponents: number;
  baseCount: number;
  legacyRadixCount: number;
  mixedCount: number;
  unknownCount: number;
  evidenceTotals: Record<string, number>;
}
```

## Ruleset Examples

```typescript
export const baseUiTabsRule: Rule = {
  id: 'base-ui/tabs-import',
  title: 'Base UI Tabs import',
  description: 'Detects import usage of Base UI Tabs',
  severity: 'medium',
  weight: 3,
  predicate: { any: [{ importSource: '@base-ui/react/tabs' }] },
};
```
