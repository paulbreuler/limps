import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import type { ToolContext } from '../src/types.js';
import { handleConfigureScoring } from '../src/tools/configure-scoring.js';
import { FrontmatterHandler } from '../src/utils/frontmatter.js';
import { readAgentFile } from '../src/agent-parser.js';

const frontmatterHandler = new FrontmatterHandler();

function createPlanFile(plansPath: string, planFolder: string): string {
  const planDir = join(plansPath, planFolder);
  mkdirSync(planDir, { recursive: true });
  const planFilePath = join(planDir, `${planFolder}-plan.md`);
  const content = `---
title: Test Plan
---

# Plan
`;
  writeFileSync(planFilePath, content, 'utf-8');
  return planFilePath;
}

function createAgentFile(agentsDir: string, agentNumber: string): string {
  mkdirSync(agentsDir, { recursive: true });
  const content = `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent ${agentNumber}: Test Agent
`;
  const path = join(agentsDir, `${agentNumber}_test.agent.md`);
  writeFileSync(path, content, 'utf-8');
  return path;
}

describe('configure-scoring', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansPath: string;
  let dataPath: string;
  let configPath: string;
  let context: ToolContext;
  let originalEnv: string | undefined;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
    plansPath = join(testDir, 'plans');
    dataPath = join(testDir, 'data');
    configPath = join(testDir, 'config.json');

    mkdirSync(plansPath, { recursive: true });
    mkdirSync(dataPath, { recursive: true });
    writeFileSync(
      configPath,
      JSON.stringify(
        {
          configVersion: 1,
          plansPath,
          dataPath,
          scoring: {
            weights: {
              dependency: 40,
              priority: 30,
              workload: 30,
            },
            biases: {},
          },
        },
        null,
        2
      ),
      'utf-8'
    );

    db = initializeDatabase(dbPath);
    createSchema(db);

    originalEnv = process.env.MCP_PLANNING_CONFIG;
    process.env.MCP_PLANNING_CONFIG = configPath;

    const config = loadConfig(configPath);
    context = { db, config };
  });

  afterEach(() => {
    if (db) {
      db.close();
      db = null;
    }
    if (existsSync(dbPath)) {
      unlinkSync(dbPath);
    }
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
    if (originalEnv === undefined) {
      delete process.env.MCP_PLANNING_CONFIG;
    } else {
      process.env.MCP_PLANNING_CONFIG = originalEnv;
    }
  });

  it('sets preset via tool', async () => {
    const result = await handleConfigureScoring({ preset: 'quick-wins' }, context);

    expect(result.isError).toBeFalsy();
    const updatedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(updatedConfig.scoring.preset).toBe('quick-wins');
  });

  it('merges weight overrides into config', async () => {
    const result = await handleConfigureScoring({ weights: { priority: 10 } }, context);

    expect(result.isError).toBeFalsy();
    const updatedConfig = JSON.parse(readFileSync(configPath, 'utf-8'));
    expect(updatedConfig.scoring.weights.dependency).toBe(40);
    expect(updatedConfig.scoring.weights.priority).toBe(10);
    expect(updatedConfig.scoring.weights.workload).toBe(30);
  });

  it('writes plan and agent overrides to frontmatter', async () => {
    const planFolder = '0001-test-plan';
    const planFilePath = createPlanFile(plansPath, planFolder);
    const agentsDir = join(plansPath, planFolder, 'agents');
    createAgentFile(agentsDir, '000');

    const planResult = await handleConfigureScoring(
      {
        scope: 'plan',
        targetId: planFolder,
        weights: { priority: 25 },
        biases: { plans: { [planFolder]: 5 } },
      },
      context
    );
    expect(planResult.isError).toBeFalsy();

    const planContent = readFileSync(planFilePath, 'utf-8');
    const planParsed = frontmatterHandler.parse(planContent);
    const planScoring = planParsed.frontmatter.scoring as Record<string, unknown>;
    const planWeights = planScoring.weights as Record<string, unknown>;
    expect(planWeights.priority).toBe(25);
    expect(planScoring.bias).toBe(5);

    const agentResult = await handleConfigureScoring(
      {
        scope: 'agent',
        targetId: `${planFolder}#000`,
        weights: { workload: 10 },
        biases: { plans: { [`${planFolder}#000`]: 3 } },
      },
      context
    );
    expect(agentResult.isError).toBeFalsy();

    const agent = readAgentFile(join(agentsDir, '000_test.agent.md'));
    expect(agent?.frontmatter.scoring?.weights?.workload).toBe(10);
    expect(agent?.frontmatter.scoring?.bias).toBe(3);
  });

  it('validates required inputs', async () => {
    const missingTarget = await handleConfigureScoring(
      { scope: 'plan', weights: { priority: 10 } },
      context
    );
    expect(missingTarget.isError).toBe(true);

    const invalidPreset = await handleConfigureScoring(
      { preset: 'unknown' as unknown as 'default' },
      context
    );
    expect(invalidPreset.isError).toBe(true);

    const invalidWeight = await handleConfigureScoring({ weights: { priority: -1 } }, context);
    expect(invalidWeight.isError).toBe(true);
  });
});
