/**
 * Basic get_next_task tool tests.
 *
 * Note: Comprehensive tests for the CLI-aligned scoring algorithm are in
 * mcp-tools-alignment.test.ts. These tests cover basic functionality.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, unlinkSync, writeFileSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type Database from 'better-sqlite3';
import { initializeDatabase, createSchema } from '../src/indexer.js';
import { loadConfig } from '../src/config.js';
import { handleGetNextTask } from '../src/tools/get-next-task.js';
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

describe('get-next-task', () => {
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

  it('should return task when agents exist', async () => {
    const planDir = join(plansPath, '0001-test-plan');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    createAgentFile(agentsDir, '000', {
      status: 'GAP',
      files: ['src/file.ts'],
    });

    const result = await handleGetNextTask({ planId: '0001' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');
    expect(data.taskId).toBe('0001-test-plan#000');
  });

  it('should return error when plan not found', async () => {
    const result = await handleGetNextTask({ planId: '9999' }, context);

    expect(result.isError).toBe(true);
    const data = JSON.parse(result.content[0]?.text || '{}');
    expect(data.message).toContain('not found');
  });

  it('should skip PASS and WIP agents', async () => {
    const planDir = join(plansPath, '0002-skip-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    createAgentFile(agentsDir, '000', { status: 'PASS' });
    createAgentFile(agentsDir, '001', { status: 'WIP' });
    createAgentFile(agentsDir, '002', { status: 'GAP' });

    const result = await handleGetNextTask({ planId: '0002' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');
    expect(data.taskId).toBe('0002-skip-test#002');
  });

  it('should skip BLOCKED agents', async () => {
    const planDir = join(plansPath, '0003-blocked-test');
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    createAgentFile(agentsDir, '000', { status: 'BLOCKED' });
    createAgentFile(agentsDir, '001', { status: 'GAP' });

    const result = await handleGetNextTask({ planId: '0003' }, context);

    expect(result.isError).toBeFalsy();
    const data = JSON.parse(result.content[0]?.text || '{}');
    expect(data.taskId).toBe('0003-blocked-test#001');
  });
});
