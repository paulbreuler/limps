import test from 'node:test';
import assert from 'node:assert/strict';
import { buildUnresolvedLinkDiagnostics } from '../src/editor/linkDiagnostics.js';

test('buildUnresolvedLinkDiagnostics flags unresolved markdown and wikilinks', () => {
  const content = [
    'See [README](/plans/README.md)',
    'And [[plans/0027-limps-roadmap/0027-limps-roadmap-plan.md]]',
  ].join('\n');

  const diagnostics = buildUnresolvedLinkDiagnostics(
    content,
    ['/plans/README.md', 'plans/0027-limps-roadmap/0027-limps-roadmap-plan.md'],
    () => {}
  );

  assert.equal(diagnostics.length, 2);
  assert.match(diagnostics[0]?.message ?? '', /Unresolved link/);
  assert.ok((diagnostics[0]?.actions ?? []).some((action) => action.name.includes('Strip /plans prefix')));
});

test('buildUnresolvedLinkDiagnostics ignores external links', () => {
  const content = '[Docs](https://docs.obsidian.md/Home)';
  const diagnostics = buildUnresolvedLinkDiagnostics(content, ['https://docs.obsidian.md/Home'], () => {});
  assert.equal(diagnostics.length, 0);
});

