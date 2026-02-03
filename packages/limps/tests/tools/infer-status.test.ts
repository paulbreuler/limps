/**
 * Tests for infer_status MCP tool.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { handleInferStatus, InferStatusInputSchema } from '../../src/tools/infer-status.js';
import type { ServerConfig } from '../../src/config.js';
import type { ToolContext } from '../../src/types.js';

describe('infer_status tool', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;
  let context: ToolContext;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-infer-status-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    mkdirSync(plansDir, { recursive: true });

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

  it('returns error when plan not found', async () => {
    const input = InferStatusInputSchema.parse({ planId: '9999' });
    const result = await handleInferStatus(input, context);

    expect(result.isError).toBe(true);
    const text = (result.content![0] as { type: 'text'; text: string }).text;
    expect(text).toContain('Plan not found');
  });

  it('returns empty suggestions when no agents match rules', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, '000_agent.agent.md'),
      `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0

Normal content only.
`,
      'utf-8'
    );

    const input = InferStatusInputSchema.parse({ planId: '1' });
    const result = await handleInferStatus(input, context);

    expect(result.isError).toBeFalsy();
    const text = (result.content![0] as { type: 'text'; text: string }).text;
    const data = JSON.parse(text);
    expect(data.agentsChecked).toBe(1);
    expect(data.suggestionCount).toBe(0);
    expect(data.suggestions).toEqual([]);
  });

  it('suggests BLOCKED when body mentions "blocked"', async () => {
    const planDir = join(plansDir, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    writeFileSync(
      join(agentsDir, '000_agent.agent.md'),
      `---
status: WIP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0

Currently blocked on review.
`,
      'utf-8'
    );

    const input = InferStatusInputSchema.parse({ planId: '1' });
    const result = await handleInferStatus(input, context);

    expect(result.isError).toBeFalsy();
    const text = (result.content![0] as { type: 'text'; text: string }).text;
    const data = JSON.parse(text);
    expect(data.suggestionCount).toBe(1);
    expect(data.suggestions[0].currentStatus).toBe('WIP');
    expect(data.suggestions[0].suggestedStatus).toBe('BLOCKED');
    expect(data.suggestions[0].confidence).toBe(0.7);
  });
});
