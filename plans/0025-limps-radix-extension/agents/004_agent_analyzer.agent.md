---
title: Component Analyzer
status: PASS
persona: coder
dependencies:
  - "002"
tags: [limps/agent, limps/status/pass, limps/persona/coder]
aliases: ["#004", "Analyzer Agent"]
created: 2026-01-26
updated: 2026-01-29
files:
  - path: packages/limps-headless/src/analyzer/parser.ts
    action: create
  - path: packages/limps-headless/src/analyzer/props.ts
    action: create
  - path: packages/limps-headless/src/analyzer/patterns.ts
    action: create
  - path: packages/limps-headless/src/analyzer/scorer.ts
    action: create
  - path: packages/limps-headless/src/analyzer/weights.ts
    action: create
  - path: packages/limps-headless/src/analyzer/disambiguator.ts
    action: create
  - path: packages/limps-headless/src/analyzer/rules/index.ts
    action: create
  - path: packages/limps-headless/src/analyzer/rules/dialog-popover.ts
    action: create
  - path: packages/limps-headless/src/analyzer/rules/tooltip-hovercard.ts
    action: create
  - path: packages/limps-headless/src/analyzer/rules/checkbox-switch-toggle.ts
    action: create
  - path: packages/limps-headless/src/analyzer/index.ts
    action: create
  - path: packages/limps-headless/src/tools/analyze-component.ts
    action: create
---

# Agent 004: Component Analyzer

**Plan Location**: `plans/0025-limps-radix-extension/0025-limps-radix-extension-plan.md`

## Scope

Features: #9 (Component Analyzer), #10 (Confidence Scorer), #11 (Disambiguator), #12 (radix_analyze_component)
Own: `packages/limps-headless/src/analyzer/`, `packages/limps-headless/src/tools/analyze-component.ts`
Depend on: Agent 002 for BehaviorSignature
Block: None

## Interfaces

### Export

```typescript
// packages/limps-headless/src/analyzer/index.ts
export function analyzeComponent(filePath: string): Promise<ComponentAnalysis>;
export function scoreAgainstSignatures(analysis: ComponentAnalysis, signatures: BehaviorSignature[]): PrimitiveMatch[];
export function disambiguate(matches: PrimitiveMatch[], analysis: ComponentAnalysis): PrimitiveMatch[];

// packages/limps-headless/src/tools/analyze-component.ts
export const analyzeComponentTool: Tool;
```

### Receive

```typescript
// From signatures (Agent 002)
import type { BehaviorSignature } from '../types/index.js';
import { generateSignature } from '../signatures/index.js';

// From cache (Agent 002)
import { getSignatureFromCache } from '../cache/index.js';
```

---

## Features

### #9: Component Analyzer

TL;DR: Parse local .tsx to extract behavioral contract
Status: `PASS`

TDD:
1. `parseComponent loads .tsx` → ts-morph Project → return AST
2. `extractProps finds Props interface` → search patterns → return props
3. `detectSubComponents finds Modal.Root pattern` → find assignments → list
4. `inferStatePattern from props` → reuse classifier → return pattern
5. `detectFeatures finds forwardRef, asChild` → AST search → flags

Prop detection patterns:
```typescript
// Named Props interface
interface ModalProps { ... }
// Inline props
function Modal({ open, onOpenChange }: { open: boolean; ... }) { ... }
// FC generic
const Modal: FC<ModalProps> = ...
```

Sub-component detection:
```typescript
// Property assignment
Modal.Root = ...
Modal.Content = ...
// Or compound export
export { Root, Content, Trigger }
```

### #10: Confidence Scorer

TL;DR: Score component against Radix signatures
Status: `PASS`

TDD:
1. `statePatternScore: binary match → 35` → compare patterns → weighted
2. `compositionScore: compound match → 25` → compare structure
3. `propsScore: modal found → +points` → check distinguishing
4. `antiPatternPenalty: delayDuration → -points` → check anti-props
5. `aggregateScore: sum 0-100` → combine → breakdown

Scoring weights (see interfaces.md):
- State pattern: 35 points
- Composition: 25 points
- Props signature: 20 points
- Accessibility: 10 points
- Rendering: 10 points

### #11: Disambiguator

TL;DR: Resolve ambiguous matches using domain rules
Status: `PASS`

TDD:
1. `isAmbiguous: top 2 within 10 points → true` → compare scores
2. `Dialog vs Popover: modal → Dialog` → check prop
3. `Tooltip vs HoverCard: delayDuration naming → Tooltip` → check prop name
4. `Checkbox vs Switch: Thumb → Switch` → check sub-components
5. `returns reasoning` → explain decision

Disambiguation rules (encode these):
```typescript
const RULES = {
  'Dialog-Popover': (analysis) => {
    if (analysis.propsInterface.has('modal')) return 'Dialog';
    if (analysis.subComponents.includes('Overlay')) return 'Dialog';
    if (analysis.propsInterface.has('side') || analysis.propsInterface.has('align')) return 'Popover';
    return null; // Can't disambiguate
  },
  'Tooltip-HoverCard': (analysis) => {
    if (analysis.propsInterface.has('delayDuration')) return 'Tooltip';
    if (analysis.propsInterface.has('openDelay')) return 'HoverCard';
    return null;
  },
  // ...
};
```

### #12: radix_analyze_component

TL;DR: MCP tool wrapping the analyzer pipeline
Status: `PASS`

TDD:
1. `returns ADOPT_RADIX for 70+` → high score → action
2. `returns CONSIDER_RADIX for 50-69` → medium score → action
3. `returns CUSTOM_OK for <50` → low/no match → action
4. `flags ambiguous matches` → top 2 close → isAmbiguous
5. `handles file not found` → catch → error message

Tool Schema:
```typescript
{
  name: 'radix_analyze_component',
  description: 'Analyze a React component for Radix primitive adoption',
  inputSchema: {
    type: 'object',
    properties: {
      filePath: { type: 'string', description: 'Path to .tsx file' },
      radixVersion: { type: 'string', default: 'latest' },
      threshold: { type: 'number', default: 40, description: 'Min confidence to include' }
    },
    required: ['filePath']
  }
}
```

---

## Done

- [x] parseComponent extracts AST from .tsx
- [x] Props interface found regardless of pattern
- [x] Sub-components detected (Component.Sub pattern)
- [x] State/composition/rendering patterns inferred
- [x] forwardRef, asChild detected
- [x] Scoring produces 0-100 with breakdown
- [x] All 5 scoring dimensions work
- [x] Anti-pattern penalty applied
- [x] Ambiguity detection (top 2 within 10)
- [x] Dialog/Popover disambiguation
- [x] Tooltip/HoverCard disambiguation
- [x] Checkbox/Switch/Toggle disambiguation
- [x] radix_analyze_component tool registered
- [x] Returns recommendation with action
