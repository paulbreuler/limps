/**
 * Tests for check-drift MCP tool.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleCheckDrift, CheckDriftInputSchema } from '../../src/tools/check-drift.js';
import type { ServerConfig } from '../../src/config.js';
import type { ToolContext } from '../../src/types.js';

describe('check-drift tool', () => {
  let testDir: string;
  let plansDir: string;
  let codebaseDir: string;
  let config: ServerConfig;
  let context: ToolContext;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-check-drift-tool-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    codebaseDir = join(testDir, 'codebase');
    mkdirSync(plansDir, { recursive: true });
    mkdirSync(codebaseDir, { recursive: true });

    config = {
      plansPath: plansDir,
      dataPath: join(testDir, 'data'),
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    // Context doesn't need db for this tool
    context = {
      config,
      db: null as never,
    };
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('returns clean status when no drift [tool-drift-001]', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    mkdirSync(join(codebaseDir, 'src'), { recursive: true });
    writeFileSync(join(codebaseDir, 'src', 'file1.ts'), 'content');

    writeFileSync(
      join(agentsDir, '000_agent_test.agent.md'),
      `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/file1.ts
---

# Agent 0: Test Agent
`,
      'utf-8'
    );

    const input = CheckDriftInputSchema.parse({
      planId: '1',
      codebasePath: codebaseDir,
    });

    const result = await handleCheckDrift(input, context);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe('clean');
    expect(data.driftCount).toBe(0);
  });

  it('returns drift_detected when files missing [tool-drift-002]', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    // Create codebase dir but no files
    mkdirSync(join(codebaseDir, 'src'), { recursive: true });

    writeFileSync(
      join(agentsDir, '000_agent_test.agent.md'),
      `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/missing-file.ts
---

# Agent 0: Test Agent
`,
      'utf-8'
    );

    const input = CheckDriftInputSchema.parse({
      planId: '1',
      codebasePath: codebaseDir,
    });

    const result = await handleCheckDrift(input, context);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe('drift_detected');
    expect(data.driftCount).toBe(1);
    expect(data.drifts[0].file).toBe('src/missing-file.ts');
    expect(data.drifts[0].reason).toBe('missing');
  });

  it('returns error for non-existent plan [tool-drift-003]', async () => {
    const input = CheckDriftInputSchema.parse({
      planId: '999',
      codebasePath: codebaseDir,
    });

    const result = await handleCheckDrift(input, context);

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toBe('Plan not found: 999');
  });

  it('filters by agentNumber when provided [tool-drift-004]', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    mkdirSync(join(codebaseDir, 'src'), { recursive: true });

    // Create two agents with missing files
    writeFileSync(
      join(agentsDir, '000_agent_first.agent.md'),
      `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/missing1.ts
---

# Agent 0: First
`,
      'utf-8'
    );

    writeFileSync(
      join(agentsDir, '001_agent_second.agent.md'),
      `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/missing2.ts
---

# Agent 1: Second
`,
      'utf-8'
    );

    const input = CheckDriftInputSchema.parse({
      planId: '1',
      codebasePath: codebaseDir,
      agentNumber: '001',
    });

    const result = await handleCheckDrift(input, context);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.agentsChecked).toBe(1);
    expect(data.driftCount).toBe(1);
    expect(data.drifts[0].agentNumber).toBe('001');
  });

  it('includes suggestions for renamed files [tool-drift-005]', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    mkdirSync(join(codebaseDir, 'src'), { recursive: true });
    writeFileSync(join(codebaseDir, 'src', 'config.ts'), 'content');

    writeFileSync(
      join(agentsDir, '000_agent_test.agent.md'),
      `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/configuration.ts
---

# Agent 0: Test Agent
`,
      'utf-8'
    );

    const input = CheckDriftInputSchema.parse({
      planId: '1',
      codebasePath: codebaseDir,
    });

    const result = await handleCheckDrift(input, context);

    expect(result.isError).toBeUndefined();
    const data = JSON.parse(result.content[0].text);
    expect(data.status).toBe('drift_detected');
    expect(data.drifts[0].reason).toBe('renamed');
    expect(data.drifts[0].suggestion).toBe('src/config.ts');
  });
});
