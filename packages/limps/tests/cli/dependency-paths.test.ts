import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { convertDependenciesToPaths } from '../../src/cli/dependency-paths.js';

function writeAgent(path: string, content: string): void {
  writeFileSync(path, content, 'utf8');
}

describe('convertDependenciesToPaths', () => {
  it('converts numeric depends_on values to local file paths', () => {
    const root = mkdtempSync(join(tmpdir(), 'limps-deps-to-paths-'));
    const plansPath = join(root, 'plans');
    const agentsDir = join(plansPath, '0001-test-plan', 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeAgent(
      join(agentsDir, '000-base.agent.md'),
      `---
status: GAP
persona: coder
depends_on: []
blocks: []
files: []
---

# Agent 000
`
    );

    writeAgent(
      join(agentsDir, '001-next.agent.md'),
      `---
status: GAP
persona: coder
depends_on: [0, "000"]
blocks: []
files: []
---

# Agent 001
`
    );

    const result = convertDependenciesToPaths({ plansPath });
    expect(result.dependenciesConverted).toBe(2);
    expect(result.filesUpdated).toBe(1);

    const content = readFileSync(join(agentsDir, '001-next.agent.md'), 'utf8');
    expect(content).toContain('depends_on:');
    expect(content).toContain('- ./000-base.agent.md');
  });

  it('supports check mode without writing files', () => {
    const root = mkdtempSync(join(tmpdir(), 'limps-deps-to-paths-check-'));
    const plansPath = join(root, 'plans');
    const agentsDir = join(plansPath, '0002-test-plan', 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeAgent(
      join(agentsDir, '000-core.agent.md'),
      `---
status: GAP
persona: coder
depends_on: []
blocks: []
files: []
---
`
    );

    const target = join(agentsDir, '001-feature.agent.md');
    writeAgent(
      target,
      `---
status: GAP
persona: coder
depends_on: [000]
blocks: []
files: []
---
`
    );

    const result = convertDependenciesToPaths({ plansPath, checkOnly: true });
    expect(result.dependenciesConverted).toBe(1);

    const content = readFileSync(target, 'utf8');
    expect(content).toContain('depends_on: [000]');
  });
});
