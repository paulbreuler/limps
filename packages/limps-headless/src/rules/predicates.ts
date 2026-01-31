import type { ComponentIR } from '../analysis/ir/types.js';
import type { Condition, Predicate } from './types.js';

interface ConditionResult {
  matched: boolean;
  evidenceIds: string[];
}

function evidenceIdForImport(source: string): string | null {
  if (source.startsWith('@base-ui/react/')) {
    return `import:base-ui:${source.slice('@base-ui/react/'.length)}`;
  }
  if (source.startsWith('@base-ui/')) {
    return `import:base-ui:${source.slice('@base-ui/'.length)}`;
  }
  if (source === 'radix-ui') {
    return 'import:radix-ui:radix-ui';
  }
  if (source.startsWith('@radix-ui/react-')) {
    return `import:radix-ui:${source.slice('@radix-ui/react-'.length)}`;
  }
  if (source.startsWith('@radix-ui/')) {
    return `import:radix-ui:${source.slice('@radix-ui/'.length)}`;
  }
  return null;
}

function matchEvidence(evidenceIds: Set<string>, id: string): ConditionResult {
  return {
    matched: evidenceIds.has(id),
    evidenceIds: evidenceIds.has(id) ? [id] : [],
  };
}

export function evaluateCondition(ir: ComponentIR, condition: Condition): ConditionResult {
  const evidenceIds = new Set(ir.evidence.map((entry) => entry.id));

  if ('evidenceId' in condition) {
    return matchEvidence(evidenceIds, condition.evidenceId);
  }

  if ('importSource' in condition) {
    const matches = ir.imports.some((spec) => spec.source === condition.importSource);
    const derivedId = evidenceIdForImport(condition.importSource);
    if (matches && derivedId) {
      return matchEvidence(evidenceIds, derivedId);
    }
    return { matched: matches, evidenceIds: matches && derivedId ? [derivedId] : [] };
  }

  if ('jsxElement' in condition) {
    const matched = ir.jsx.elements.includes(condition.jsxElement);
    return { matched, evidenceIds: matched ? [`jsx:${condition.jsxElement}`] : [] };
  }

  if ('role' in condition) {
    return matchEvidence(evidenceIds, `role:${condition.role}`);
  }

  if ('dataAttr' in condition) {
    return matchEvidence(evidenceIds, `data-attr:${condition.dataAttr}`);
  }

  if ('behavior' in condition) {
    return matchEvidence(evidenceIds, `behavior:${condition.behavior}`);
  }

  if ('typeRef' in condition) {
    return { matched: false, evidenceIds: [] };
  }

  return { matched: false, evidenceIds: [] };
}

export function evaluatePredicate(ir: ComponentIR, predicate: Predicate): ConditionResult {
  const evidenceIds: string[] = [];

  if (!predicate.any && !predicate.all && !predicate.not) {
    return { matched: false, evidenceIds };
  }

  if (predicate.all) {
    for (const condition of predicate.all) {
      const result = evaluateCondition(ir, condition);
      if (!result.matched) {
        return { matched: false, evidenceIds: [] };
      }
      evidenceIds.push(...result.evidenceIds);
    }
  }

  if (predicate.any) {
    let matchedAny = false;
    const anyEvidence: string[] = [];
    for (const condition of predicate.any) {
      const result = evaluateCondition(ir, condition);
      if (result.matched) {
        matchedAny = true;
        anyEvidence.push(...result.evidenceIds);
      }
    }
    if (!matchedAny) {
      return { matched: false, evidenceIds: [] };
    }
    evidenceIds.push(...anyEvidence);
  }

  if (predicate.not) {
    const result = evaluateCondition(ir, predicate.not);
    if (result.matched) {
      return { matched: false, evidenceIds: [] };
    }
  }

  return { matched: true, evidenceIds };
}
