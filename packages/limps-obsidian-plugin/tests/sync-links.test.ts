import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { syncObsidianGraphLinks } from '../src/graph/syncLinks.js';

function writeAgent(path: string, content: string): void {
  writeFileSync(path, content, 'utf8');
}

test('syncObsidianGraphLinks adds generated markdown links for numeric dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-obsidian-sync-'));
  const vaultPath = root;
  const plansPath = join(root, 'plans');
  const agentsDir = join(plansPath, '0001-test-plan', 'agents');
  mkdirSync(agentsDir, { recursive: true });

  writeAgent(
    join(agentsDir, '000-foundation.agent.md'),
    `---
title: Foundation
depends_on: []
---

# Agent 000
`
  );

  writeAgent(
    join(agentsDir, '001-feature.agent.md'),
    `---
title: Feature
depends_on: [0, "000"]
---

# Agent 001
`
  );

  const result = syncObsidianGraphLinks(vaultPath, plansPath);
  assert.equal(result.filesScanned, 2);
  assert.equal(result.filesUpdated, 2);

  const content = readFileSync(join(agentsDir, '001-feature.agent.md'), 'utf8');
  assert.match(content, /limps:graph-links:start/);
  assert.match(content, /Plan:/);
  assert.match(content, /\[Agent 000\]\(\.\/000-foundation\.agent\.md\)/);
});

test('syncObsidianGraphLinks replaces existing generated block', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-obsidian-sync-replace-'));
  const plansPath = join(root, 'plans');
  const agentsDir = join(plansPath, '0002-test-plan', 'agents');
  mkdirSync(agentsDir, { recursive: true });

  writeAgent(
    join(agentsDir, '000-base.agent.md'),
    `---
title: Base
depends_on: []
---

# Agent 000
`
  );

  writeAgent(
    join(agentsDir, '001-next.agent.md'),
    `---
title: Next
depends_on: [000]
---

# Agent 001

<!-- limps:graph-links:start -->
old block
<!-- limps:graph-links:end -->
`
  );

  syncObsidianGraphLinks(root, plansPath);
  const content = readFileSync(join(agentsDir, '001-next.agent.md'), 'utf8');

  const markerCount = (content.match(/limps:graph-links:start/g) ?? []).length;
  assert.equal(markerCount, 1);
  assert.match(content, /Depends on:/);
  assert.match(content, /\[Agent 000\]\(\.\/000-base\.agent\.md\)/);
  assert.doesNotMatch(content, /old block/);
});

test('syncObsidianGraphLinks parses multiline depends_on arrays', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-obsidian-sync-multiline-'));
  const plansPath = join(root, 'plans');
  const agentsDir = join(plansPath, '0014-test-plan', 'agents');
  mkdirSync(agentsDir, { recursive: true });

  writeAgent(
    join(agentsDir, '001-dep.agent.md'),
    `---
title: Dependency
depends_on: []
---

# Agent 001
`
  );

  writeAgent(
    join(agentsDir, '004-main.agent.md'),
    `---
title: Main
depends_on:
  - "0014#001"
---

# Agent 004
`
  );

  syncObsidianGraphLinks(root, plansPath);
  const content = readFileSync(join(agentsDir, '004-main.agent.md'), 'utf8');
  assert.match(content, /Agent 001/);
  assert.match(content, /\[Agent 001\]\(\.\/001-dep\.agent\.md\)/);
});

test('syncObsidianGraphLinks parses path-based dependencies', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-obsidian-sync-path-'));
  const plansPath = join(root, 'plans');
  const agentsDir = join(plansPath, '0015-test-plan', 'agents');
  mkdirSync(agentsDir, { recursive: true });

  writeAgent(
    join(agentsDir, '000-base.agent.md'),
    `---
title: Base
depends_on: []
---

# Agent 000
`
  );

  writeAgent(
    join(agentsDir, '002-main.agent.md'),
    `---
title: Main
depends_on: ["./000-base.agent.md"]
---

# Agent 002
`
  );

  syncObsidianGraphLinks(root, plansPath);
  const content = readFileSync(join(agentsDir, '002-main.agent.md'), 'utf8');
  assert.match(content, /\[Agent 000\]\(\.\/000-base\.agent\.md\)/);
});

test('syncObsidianGraphLinks writes blocks links when blocks frontmatter is present', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-obsidian-sync-blocks-'));
  const plansPath = join(root, 'plans');
  const agentsDir = join(plansPath, '0016-test-plan', 'agents');
  mkdirSync(agentsDir, { recursive: true });

  writeAgent(
    join(agentsDir, '000-base.agent.md'),
    `---
title: Base
depends_on: []
blocks: []
---

# Agent 000
`
  );

  writeAgent(
    join(agentsDir, '001-main.agent.md'),
    `---
title: Main
depends_on: []
blocks: [000]
---

# Agent 001
`
  );

  syncObsidianGraphLinks(root, plansPath);
  const content = readFileSync(join(agentsDir, '001-main.agent.md'), 'utf8');
  assert.match(content, /Blocks:/);
  assert.match(content, /\[Agent 000\]\(\.\/000-base\.agent\.md\)/);
});

test('syncObsidianGraphLinks includes canvas and base links in plan block', () => {
  const root = mkdtempSync(join(tmpdir(), 'limps-obsidian-sync-surfaces-'));
  const plansPath = join(root, 'plans');
  const planDir = join(plansPath, '0020-surface-plan');
  const agentsDir = join(planDir, 'agents');
  mkdirSync(agentsDir, { recursive: true });

  writeAgent(
    join(agentsDir, '000-bootstrap.agent.md'),
    `---
title: Bootstrap
depends_on: []
---

# Agent 000
`
  );

  writeAgent(
    join(planDir, '0020-surface-plan-plan.md'),
    `---
title: Surface Plan
---

# Plan
`
  );

  writeFileSync(join(planDir, 'Flow.canvas'), '{}\n', 'utf8');
  writeFileSync(
    join(planDir, 'Ops.base'),
    `views:
  - type: table
    name: Table
`,
    'utf8'
  );

  syncObsidianGraphLinks(root, plansPath);
  const planContent = readFileSync(join(planDir, '0020-surface-plan-plan.md'), 'utf8');

  assert.match(planContent, /Canvas boards:/);
  assert.match(planContent, /\[Flow]\(\.\/Flow\.canvas\)/);
  assert.match(planContent, /Bases:/);
  assert.match(planContent, /\[Ops]\(\.\/Ops\.base\)/);
});
