/**
 * Test for plan status / next task staleness after file changes.
 * Reproduces issue: Plan status / next task stale after closing plan on disk
 *
 * When agent files are updated on disk (e.g., Status: GAP -> Status: PASS),
 * the tools get_plan_status and get_next_task should reflect the changes
 * immediately without requiring a server restart.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handleGetNextTask } from '../src/tools/get-next-task.js';
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

/**
 * Update agent file status by modifying the YAML frontmatter.
 */
function updateAgentStatus(filePath: string, newStatus: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED'): void {
  const content = readFileSync(filePath, 'utf-8');
  // Replace status in frontmatter
  const updated = content.replace(/status:\s*\w+/, `status: ${newStatus}`);
  writeFileSync(filePath, updated, 'utf-8');
}

describe('Plan status staleness after file changes', () => {
  let dbPath: string;
  let db: Database.Database | null = null;
  let testDir: string;
  let plansPath: string;
  let context: ToolContext;

  beforeEach(async () => {
    dbPath = join(tmpdir(), `test-db-${Date.now()}.sqlite`);
    testDir = join(tmpdir(), `test-docs-${Date.now()}`);
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

  it('should reflect updated status in get_plan_status after file change', async () => {
    // Create a plan with 2 agents, both GAP
    const planDir = join(plansPath, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    const agent1Path = createAgentFile(agentsDir, '000', { status: 'GAP' });
    const agent2Path = createAgentFile(agentsDir, '001', { status: 'GAP' });

    // Initial status check - should be 0% complete
    const result1 = await handleGetPlanStatus({ planId: '0001' }, context);
    expect(result1.isError).toBeFalsy();
    const status1 = JSON.parse(result1.content[0]?.text || '{}');
    expect(status1.completionPercentage).toBe(0);
    expect(status1.statusCounts.GAP).toBe(2);
    expect(status1.statusCounts.PASS).toBe(0);

    // Update both agents to PASS
    updateAgentStatus(agent1Path, 'PASS');
    updateAgentStatus(agent2Path, 'PASS');

    // Check status again - should now be 100% complete WITHOUT restarting server
    const result2 = await handleGetPlanStatus({ planId: '0001' }, context);
    expect(result2.isError).toBeFalsy();
    const status2 = JSON.parse(result2.content[0]?.text || '{}');
    expect(status2.completionPercentage).toBe(100);
    expect(status2.statusCounts.GAP).toBe(0);
    expect(status2.statusCounts.PASS).toBe(2);
  });

  it('should reflect updated status in get_next_task after file change', async () => {
    // Create a plan with 2 agents, both GAP
    const planDir = join(plansPath, '0002-next-task-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    const agent1Path = createAgentFile(agentsDir, '000', {
      status: 'GAP',
      files: ['src/file1.ts'],
    });
    const agent2Path = createAgentFile(agentsDir, '001', {
      status: 'GAP',
      files: ['src/file2.ts'],
    });

    // Initial next task - should return agent 000
    const result1 = await handleGetNextTask({ planId: '0002' }, context);
    expect(result1.isError).toBeFalsy();
    const task1 = JSON.parse(result1.content[0]?.text || '{}');
    expect(task1.taskId).toBe('0002-next-task-test#000');

    // Update both agents to PASS
    updateAgentStatus(agent1Path, 'PASS');
    updateAgentStatus(agent2Path, 'PASS');

    // Check next task again - should return "All tasks completed!" WITHOUT restarting server
    const result2 = await handleGetNextTask({ planId: '0002' }, context);
    expect(result2.isError).toBeFalsy();
    const task2 = JSON.parse(result2.content[0]?.text || '{}');
    expect(task2.message).toBe('All tasks completed!');
  });

  it('should reflect partial status updates correctly', async () => {
    // Create a plan with 3 agents
    const planDir = join(plansPath, '0003-partial-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    const agent1Path = createAgentFile(agentsDir, '000', { status: 'GAP' });
    const agent2Path = createAgentFile(agentsDir, '001', { status: 'GAP' });
    const agent3Path = createAgentFile(agentsDir, '002', { status: 'GAP' });

    // Initial status - 0% complete
    const result1 = await handleGetPlanStatus({ planId: '0003' }, context);
    const status1 = JSON.parse(result1.content[0]?.text || '{}');
    expect(status1.completionPercentage).toBe(0);

    // Update first agent to PASS
    updateAgentStatus(agent1Path, 'PASS');

    // Status should be 33% complete
    const result2 = await handleGetPlanStatus({ planId: '0003' }, context);
    const status2 = JSON.parse(result2.content[0]?.text || '{}');
    expect(status2.completionPercentage).toBe(33); // 1/3 = 33%

    // Update second agent to PASS
    updateAgentStatus(agent2Path, 'PASS');

    // Status should be 67% complete
    const result3 = await handleGetPlanStatus({ planId: '0003' }, context);
    const status3 = JSON.parse(result3.content[0]?.text || '{}');
    expect(status3.completionPercentage).toBe(67); // 2/3 = 67%

    // Update third agent to PASS
    updateAgentStatus(agent3Path, 'PASS');

    // Status should be 100% complete
    const result4 = await handleGetPlanStatus({ planId: '0003' }, context);
    const status4 = JSON.parse(result4.content[0]?.text || '{}');
    expect(status4.completionPercentage).toBe(100);
  });
});
