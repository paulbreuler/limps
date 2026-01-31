import { describe, it, expect } from 'vitest';
import { buildComponentIr } from '../src/analysis/ir/build-ir.js';
import { collectEvidence } from '../src/analysis/passes/index.js';

const filePath = '/tmp/Demo.tsx';

describe('evidence passes', () => {
  it('extracts import, role, data-attr, and behavior evidence', () => {
    const source = `
import { Tabs } from '@base-ui/react/tabs';

export function Demo() {
  return (
    <div role="menu" data-state="open" data-test-id="noop" tabIndex={0} onKeyDown={() => {}} />
  );
}
`;

    const ir = buildComponentIr({ filePath, sourceText: source });
    const bundle = collectEvidence(ir, { filePath, sourceText: source });
    const ids = bundle.evidence.map((entry) => entry.id);

    expect(ids).toContain('import:base-ui:tabs');
    expect(ids).toContain('role:menu');
    expect(ids).toContain('data-attr:data-state');
    expect(ids).toContain('behavior:roving-tabindex');
    expect(ids).not.toContain('data-attr:data-test-id');
    expect(bundle.jsx.roles).toContain('menu');
    expect(bundle.jsx.dataAttrs).toContain('data-state');
    expect(bundle.jsx.dataAttrs).toContain('data-test-id');
    expect(bundle.behaviors.behaviors).toContain('roving-tabindex');
  });

  it('detects portal usage', () => {
    const source = `
import { createPortal } from 'react-dom';

export function Demo() {
  return createPortal(<div />, document.body);
}
`;

    const ir = buildComponentIr({ filePath, sourceText: source });
    const bundle = collectEvidence(ir, { filePath, sourceText: source });
    const ids = bundle.evidence.map((entry) => entry.id);

    expect(ids).toContain('behavior:portal');
    expect(bundle.behaviors.behaviors).toContain('portal');
  });
});
