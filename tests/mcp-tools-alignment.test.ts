/**
 * Tests for MCP tools aligned with CLI functionality.
 *
 * These tests verify that MCP tools provide the same rich experience
 * as CLI commands for LLM consumption.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handleGetNextTask } from '../src/tools/get-next-task.js';
import { handleListPlans } from '../src/tools/list-plans.js';
import { handleListAgents } from '../src/tools/list-agents.js';
import { handleGetPlanStatus } from '../src/tools/get-plan-status.js';
import type { ToolContext } from '../src/types.js';

/**
 * Helper to create agent file with YAML frontmatter.
 */
function createAgentFile(
  agentsDir: string,
  agentNumber: string,
  options: {
    status?: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
    persona?: 'coder' | 'reviewer' | 'pm' | 'customer';
    dependencies?: string[];
    files?: string[];
    title?: string;
  } = {}
): string {
  const {
    status = 'GAP',
    persona = 'coder',
    dependencies = [],
    files = [],
    title = `Agent ${agentNumber}`,
  } = options;

  const frontmatter = `---
status: ${status}
persona: ${persona}
dependencies: [${dependencies.map((d) => `"${d}"`).join(', ')}]
blocks: []
files: [${files.map((f) => `"${f}"`).join(', ')}]
---`;

  const content = `${frontmatter}

# Agent ${agentNumber}: ${title}

## Task Description

This is a test agent.
`;

  const filePath = join(agentsDir, `${agentNumber}_agent_test.agent.md`);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

describe('get_next_task with planId (CLI-aligned scoring)', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-mcp-${Date.now()}`);
    plansPath = join(testDir, 'plans');

    mkdirSync(plansPath, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.plansPath = plansPath;

    context = {
      db,
      config,
    };
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
  });

  it('should return score breakdown when planId is provided', async () => {
    // Create plan directory with agents
    const planDir = join(plansPath, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    // Create agent files
    createAgentFile(agentsDir, '000', {
      status: 'GAP',
      persona: 'coder',
      files: ['src/file1.ts'],
    });

    const result = await handleGetNextTask({ agentType: 'coder', planId: '0001' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    // Should have score breakdown
    expect(data.taskId).toBe('0001-test-plan#000');
    expect(data.totalScore).toBeDefined();
    expect(data.dependencyScore).toBeDefined();
    expect(data.priorityScore).toBeDefined();
    expect(data.workloadScore).toBeDefined();
    expect(data.reasons).toBeInstanceOf(Array);
  });

  it('should use CLI scoring algorithm (40/30/30)', async () => {
    const planDir = join(plansPath, '0002-scoring-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    // Create agent with no dependencies, low agent number (high priority), few files
    createAgentFile(agentsDir, '000', {
      status: 'GAP',
      persona: 'coder',
      dependencies: [],
      files: ['src/one.ts'],
    });

    const result = await handleGetNextTask({ agentType: 'coder', planId: '0002' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    // No dependencies = 40 points
    expect(data.dependencyScore).toBe(40);
    // Agent 0 = 30 - 0*3 = 30 points
    expect(data.priorityScore).toBe(30);
    // 1 file = 30 - 1*5 = 25 points
    expect(data.workloadScore).toBe(25);
    // Total = 40 + 30 + 25 = 95
    expect(data.totalScore).toBe(95);
  });

  it('should return otherAvailableTasks count', async () => {
    const planDir = join(plansPath, '0003-multi-agent');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    // Create multiple eligible agents
    createAgentFile(agentsDir, '000', { status: 'GAP' });
    createAgentFile(agentsDir, '001', { status: 'GAP' });
    createAgentFile(agentsDir, '002', { status: 'GAP' });

    const result = await handleGetNextTask({ agentType: 'coder', planId: '0003' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    expect(data.otherAvailableTasks).toBe(2);
  });

  it('should prioritize by agent number (lower = higher priority)', async () => {
    const planDir = join(plansPath, '0004-priority-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    // Create agents with different numbers (all else equal)
    createAgentFile(agentsDir, '005', { status: 'GAP', files: ['a.ts'] });
    createAgentFile(agentsDir, '001', { status: 'GAP', files: ['b.ts'] });
    createAgentFile(agentsDir, '010', { status: 'GAP', files: ['c.ts'] });

    const result = await handleGetNextTask({ agentType: 'coder', planId: '0004' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    // Agent 001 should win due to highest priority score
    expect(data.taskId).toBe('0004-priority-test#001');
  });

  it('should exclude agents with unsatisfied dependencies', async () => {
    const planDir = join(plansPath, '0005-deps-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    // Agent 001 depends on 000, which is GAP (not satisfied)
    createAgentFile(agentsDir, '000', { status: 'GAP', files: ['a.ts'] });
    createAgentFile(agentsDir, '001', {
      status: 'GAP',
      dependencies: ['000'],
      files: ['b.ts'],
    });

    const result = await handleGetNextTask({ agentType: 'coder', planId: '0005' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    // Only agent 000 should be eligible
    expect(data.taskId).toBe('0005-deps-test#000');
    expect(data.otherAvailableTasks).toBe(0);
  });

  it('should include agent when dependencies are PASS', async () => {
    const planDir = join(plansPath, '0006-deps-pass');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    // Agent 000 is PASS, agent 001 depends on it
    createAgentFile(agentsDir, '000', { status: 'PASS', files: ['a.ts'] });
    createAgentFile(agentsDir, '001', {
      status: 'GAP',
      dependencies: ['000'],
      files: ['b.ts'],
    });

    const result = await handleGetNextTask({ agentType: 'coder', planId: '0006' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    // Agent 001 should be eligible now
    expect(data.taskId).toBe('0006-deps-pass#001');
  });

  // Note: Backward compatibility test removed - planId is now required in v2
});

describe('list_plans MCP tool', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-list-plans-${Date.now()}`);
    plansPath = join(testDir, 'plans');

    mkdirSync(plansPath, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.plansPath = plansPath;

    context = {
      db,
      config,
    };
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
  });

  it('should list all plans with structured data', async () => {
    // Create multiple plan directories with plan.md files
    const plan1Dir = join(plansPath, '0001-first-feature');
    const plan2Dir = join(plansPath, '0002-bug-fix');
    mkdirSync(plan1Dir, { recursive: true });
    mkdirSync(plan2Dir, { recursive: true });

    writeFileSync(
      join(plan1Dir, 'plan.md'),
      `---
status: WIP
---

# First Feature Plan

This is the overview for the first feature.

## Details
`,
      'utf-8'
    );

    writeFileSync(
      join(plan2Dir, 'plan.md'),
      `---
status: GAP
---

# Bug Fix Plan

Fixing a critical bug in the system.

## Steps
`,
      'utf-8'
    );

    const result = await handleListPlans({}, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    expect(data.plans).toHaveLength(2);
    expect(data.total).toBe(2);

    // Check first plan
    const plan1 = data.plans.find((p: { number: string }) => p.number === '0001');
    expect(plan1).toBeDefined();
    expect(plan1.name).toBe('First Feature');
    expect(plan1.status).toBe('WIP');
    expect(plan1.overview).toBeDefined();

    // Check second plan
    const plan2 = data.plans.find((p: { number: string }) => p.number === '0002');
    expect(plan2).toBeDefined();
    expect(plan2.name).toBe('Bug Fix');
    expect(plan2.status).toBe('GAP');
  });

  it('should detect work type from directory name', async () => {
    const featureDir = join(plansPath, '0001-feature-login');
    const bugDir = join(plansPath, '0002-bug-auth-fix');
    const refactorDir = join(plansPath, '0003-refactor-db');
    mkdirSync(featureDir, { recursive: true });
    mkdirSync(bugDir, { recursive: true });
    mkdirSync(refactorDir, { recursive: true });

    writeFileSync(join(featureDir, 'plan.md'), '# Login Feature\n\nOverview here.', 'utf-8');
    writeFileSync(join(bugDir, 'plan.md'), '# Auth Bug Fix\n\nOverview here.', 'utf-8');
    writeFileSync(join(refactorDir, 'plan.md'), '# DB Refactor\n\nOverview here.', 'utf-8');

    const result = await handleListPlans({}, context);
    const data = JSON.parse(result.content[0]?.text || '{}');

    expect(data.plans.find((p: { number: string }) => p.number === '0001')?.workType).toBe(
      'feature'
    );
    expect(data.plans.find((p: { number: string }) => p.number === '0002')?.workType).toBe('bug');
    expect(data.plans.find((p: { number: string }) => p.number === '0003')?.workType).toBe(
      'refactor'
    );
  });

  it('should return error when no plans exist', async () => {
    const result = await handleListPlans({}, context);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('No plans found');
  });
});

describe('list_agents MCP tool', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-list-agents-${Date.now()}`);
    plansPath = join(testDir, 'plans');

    mkdirSync(plansPath, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.plansPath = plansPath;

    context = {
      db,
      config,
    };
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
  });

  it('should list all agents for a plan', async () => {
    const planDir = join(plansPath, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    createAgentFile(agentsDir, '000', {
      status: 'PASS',
      persona: 'coder',
      files: ['src/a.ts'],
    });
    createAgentFile(agentsDir, '001', {
      status: 'WIP',
      persona: 'reviewer',
      dependencies: ['000'],
      files: ['src/b.ts', 'src/c.ts'],
    });
    createAgentFile(agentsDir, '002', {
      status: 'GAP',
      persona: 'coder',
      dependencies: ['001'],
      files: [],
    });

    const result = await handleListAgents({ planId: '0001' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    expect(data.agents).toHaveLength(3);
    expect(data.total).toBe(3);
    expect(data.planName).toContain('0001-test-plan');

    // Check status counts
    expect(data.statusCounts.PASS).toBe(1);
    expect(data.statusCounts.WIP).toBe(1);
    expect(data.statusCounts.GAP).toBe(1);
    expect(data.statusCounts.BLOCKED).toBe(0);

    // Check agent details
    const agent0 = data.agents.find((a: { agentNumber: string }) => a.agentNumber === '000');
    expect(agent0.status).toBe('PASS');
    expect(agent0.persona).toBe('coder');
    expect(agent0.fileCount).toBe(1);
    expect(agent0.dependencyCount).toBe(0);

    const agent1 = data.agents.find((a: { agentNumber: string }) => a.agentNumber === '001');
    expect(agent1.status).toBe('WIP');
    expect(agent1.persona).toBe('reviewer');
    expect(agent1.fileCount).toBe(2);
    expect(agent1.dependencyCount).toBe(1);
  });

  it('should return error for non-existent plan', async () => {
    const result = await handleListAgents({ planId: '9999' }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Plan not found');
  });

  it('should find plan by partial number match', async () => {
    const planDir = join(plansPath, '0042-answer-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    createAgentFile(agentsDir, '000', { status: 'GAP' });

    // Should match with just "42"
    const result = await handleListAgents({ planId: '42' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');
    expect(data.planName).toContain('0042');
  });
});

describe('get_plan_status MCP tool', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-plan-status-${Date.now()}`);
    plansPath = join(testDir, 'plans');

    mkdirSync(plansPath, { recursive: true });
    db = initializeDatabase(dbPath);
    createSchema(db);

    const config = loadConfig(join(testDir, 'config.json'));
    config.plansPath = plansPath;

    context = {
      db,
      config,
    };
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
  });

  it('should return completion percentage', async () => {
    const planDir = join(plansPath, '0001-status-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    // 2 PASS out of 4 = 50%
    createAgentFile(agentsDir, '000', { status: 'PASS' });
    createAgentFile(agentsDir, '001', { status: 'PASS' });
    createAgentFile(agentsDir, '002', { status: 'WIP' });
    createAgentFile(agentsDir, '003', { status: 'GAP' });

    const result = await handleGetPlanStatus({ planId: '0001' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    expect(data.completionPercentage).toBe(50);
    expect(data.totalAgents).toBe(4);
    expect(data.statusCounts.PASS).toBe(2);
    expect(data.statusCounts.WIP).toBe(1);
    expect(data.statusCounts.GAP).toBe(1);
  });

  it('should list blocked and WIP agents', async () => {
    const planDir = join(plansPath, '0002-blocked-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    createAgentFile(agentsDir, '000', { status: 'BLOCKED', title: 'Blocked Agent' });
    createAgentFile(agentsDir, '001', { status: 'WIP', title: 'Active Agent' });
    createAgentFile(agentsDir, '002', { status: 'GAP', title: 'Pending Agent' });

    const result = await handleGetPlanStatus({ planId: '0002' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    expect(data.blockedAgents).toHaveLength(1);
    expect(data.blockedAgents[0]).toContain('000');
    expect(data.blockedAgents[0]).toContain('Blocked Agent');

    expect(data.wipAgents).toHaveLength(1);
    expect(data.wipAgents[0]).toContain('001');
    expect(data.wipAgents[0]).toContain('Active Agent');
  });

  it('should return persona distribution', async () => {
    const planDir = join(plansPath, '0003-persona-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    createAgentFile(agentsDir, '000', { status: 'GAP', persona: 'coder' });
    createAgentFile(agentsDir, '001', { status: 'GAP', persona: 'coder' });
    createAgentFile(agentsDir, '002', { status: 'GAP', persona: 'reviewer' });
    createAgentFile(agentsDir, '003', { status: 'GAP', persona: 'pm' });

    const result = await handleGetPlanStatus({ planId: '0003' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');

    expect(data.personaCounts.coder).toBe(2);
    expect(data.personaCounts.reviewer).toBe(1);
    expect(data.personaCounts.pm).toBe(1);
    expect(data.personaCounts.customer).toBe(0);
  });

  it('should return error for non-existent plan', async () => {
    const result = await handleGetPlanStatus({ planId: '9999' }, context);

    expect(result.isError).toBe(true);
    expect(result.content[0]?.text).toContain('Plan not found');
  });
});
