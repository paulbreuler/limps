---
title: Component Analyzer
status: GAP
persona: coder
dependencies:
  - 002_agent_signatures.agent.md
files:
  - path: src/analyzer/parser.ts
    action: create
  - path: src/analyzer/props.ts
    action: create
  - path: src/analyzer/patterns.ts
    action: create
  - path: src/analyzer/scorer.ts
    action: create
  - path: src/analyzer/weights.ts
    action: create
  - path: src/analyzer/disambiguator.ts
    action: create
  - path: src/analyzer/rules/index.ts
    action: create
  - path: src/analyzer/rules/dialog-popover.ts
    action: create
  - path: src/analyzer/rules/tooltip-hovercard.ts
    action: create
  - path: src/analyzer/rules/checkbox-switch-toggle.ts
    action: create
  - path: src/analyzer/index.ts
    action: create
  - path: src/tools/analyze-component.ts
    action: create
---

# Agent 004: Component Analyzer

**Plan Location**: `plans/0025-limps-radix-extension/plan.md`

## Scope

Features: #9 (Component Analyzer), #10 (Confidence Scorer), #11 (Disambiguator), #12 (radix_analyze_component)
Own: `src/analyzer/`, `src/tools/analyze-component.ts`
Depend on: Agent 002 for BehaviorSignature
Block: None

## Interfaces

### Export

```typescript
// src/analyzer/index.ts
export function analyzeComponent(filePath: string): Promise<ComponentAnalysis>;
export function scoreAgainstSignatures(analysis: ComponentAnalysis, signatures: BehaviorSignature[]): PrimitiveMatch[];
export function disambiguate(matches: PrimitiveMatch[], analysis: ComponentAnalysis): PrimitiveMatch[];

// src/tools/analyze-component.ts
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
Status: `GAP`

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
Status: `GAP`

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
Status: `GAP`

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
Status: `GAP`

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

- [ ] parseComponent extracts AST from .tsx
- [ ] Props interface found regardless of pattern
- [ ] Sub-components detected (Component.Sub pattern)
- [ ] State/composition/rendering patterns inferred
- [ ] forwardRef, asChild detected
- [ ] Scoring produces 0-100 with breakdown
- [ ] All 5 scoring dimensions work
- [ ] Anti-pattern penalty applied
- [ ] Ambiguity detection (top 2 within 10)
- [ ] Dialog/Popover disambiguation
- [ ] Tooltip/HoverCard disambiguation
- [ ] Checkbox/Switch/Toggle disambiguation
- [ ] radix_analyze_component tool registered
- [ ] Returns recommendation with action
