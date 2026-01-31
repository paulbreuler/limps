import { describe, it, expect, vi } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

vi.mock('../src/differ/index.js', () => ({
  diffVersions: vi.fn().mockResolvedValue({
    fromVersion: 'n/a',
    toVersion: 'n/a',
    hasBreakingChanges: false,
    summary: { totalChanges: 0, breaking: 0, warnings: 0, info: 0 },
    changes: [],
  }),
}));

vi.mock('../src/fetcher/npm-registry.js', () => ({
  resolvePackageVersion: vi.fn().mockResolvedValue('0.0.0'),
}));

import { runAudit } from '../src/audit/index.js';

function mkdtemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'limps-headless-audit-integration-'));
}

describe('audit integration', () => {
  it('writes rules into analysis output', async () => {
    const outputDir = mkdtemp();
    const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'base-import.tsx');
    const relative = path.relative(process.cwd(), fixturePath);

    const result = await runAudit({
      scope: { files: [relative] },
      outputDir,
      format: 'json',
      ruleset: 'base-ui',
      evidence: 'summary',
    });

    const analysisRaw = fs.readFileSync(result.analysisPath!, 'utf-8');
    const analysis = JSON.parse(analysisRaw);
    expect(analysis.results.length).toBeGreaterThan(0);
    expect(analysis.results[0].rules?.baseUi).toBeDefined();
    expect(analysis.results[0].rules?.radixLegacy).toBeUndefined();
  });
});
