import type { ComponentIR, Evidence } from '../ir/types.js';

const BASE_UI_PREFIX = '@base-ui/';
const BASE_UI_REACT_PREFIX = '@base-ui/react/';
const RADIX_PREFIX = '@radix-ui/';
const RADIX_REACT_PREFIX = '@radix-ui/react-';

function baseUiModule(source: string): string | null {
  if (!source.startsWith(BASE_UI_PREFIX)) return null;
  if (source.startsWith(BASE_UI_REACT_PREFIX)) {
    const rest = source.slice(BASE_UI_REACT_PREFIX.length);
    return rest || 'react';
  }
  const rest = source.slice(BASE_UI_PREFIX.length);
  return rest || 'base-ui';
}

function radixModule(source: string): string | null {
  if (source === 'radix-ui') return 'radix-ui';
  if (!source.startsWith(RADIX_PREFIX)) return null;
  if (source.startsWith(RADIX_REACT_PREFIX)) {
    const rest = source.slice(RADIX_REACT_PREFIX.length);
    return rest || 'react';
  }
  const rest = source.slice(RADIX_PREFIX.length);
  return rest || 'radix-ui';
}

function buildEvidence(id: string, source: 'import', weight = 3): Evidence {
  return {
    id,
    source,
    strength: 'strong',
    weight,
  };
}

export function extractImportEvidence(ir: ComponentIR): Evidence[] {
  const evidence: Evidence[] = [];
  const seen = new Set<string>();

  for (const spec of ir.imports) {
    const base = baseUiModule(spec.source);
    if (base) {
      const id = `import:base-ui:${base}`;
      if (!seen.has(id)) {
        seen.add(id);
        evidence.push(buildEvidence(id, 'import', 3));
      }
    }

    const radix = radixModule(spec.source);
    if (radix) {
      const id = `import:radix-ui:${radix}`;
      if (!seen.has(id)) {
        seen.add(id);
        evidence.push(buildEvidence(id, 'import', 3));
      }
    }
  }

  return evidence;
}
