import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { updateAgentStatus } from '../../src/cli/status.js';
import type { ServerConfig } from '../../src/config.js';
import type { ResolvedTaskId } from '../../src/cli/task-resolver.js';

describe('updateAgentStatus', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-status-update-${Date.now()}`);
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
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('status transitions', () => {
    it('should update status from GAP to WIP', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'WIP');

      expect(result.success).toBe(true);
      expect(result.message).toContain('GAP to WIP');

      const updatedContent = readFileSync(agentPath, 'utf-8');
      expect(updatedContent).toContain('status: WIP');
      expect(updatedContent).not.toContain('status: GAP');
    });

    it('should update status from WIP to PASS', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: WIP
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'PASS');

      expect(result.success).toBe(true);
      expect(result.message).toContain('WIP to PASS');

      const updatedContent = readFileSync(agentPath, 'utf-8');
      expect(updatedContent).toContain('status: PASS');
    });

    it('should update status from WIP to BLOCKED', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: WIP
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'BLOCKED');

      expect(result.success).toBe(true);
      expect(result.message).toContain('WIP to BLOCKED');

      const updatedContent = readFileSync(agentPath, 'utf-8');
      expect(updatedContent).toContain('status: BLOCKED');
    });

    it('should unblock from BLOCKED to WIP', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: BLOCKED
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'WIP');

      expect(result.success).toBe(true);
      expect(result.message).toContain('BLOCKED to WIP');

      const updatedContent = readFileSync(agentPath, 'utf-8');
      expect(updatedContent).toContain('status: WIP');
    });

    it('should unblock from BLOCKED to GAP', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: BLOCKED
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'GAP');

      expect(result.success).toBe(true);
      expect(result.message).toContain('BLOCKED to GAP');

      const updatedContent = readFileSync(agentPath, 'utf-8');
      expect(updatedContent).toContain('status: GAP');
    });
  });

  describe('invalid transitions', () => {
    it('should reject transition from GAP to PASS', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'PASS');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid status transition');
      expect(result.message).toContain('GAP to PASS');
    });

    it('should reject transition from GAP to BLOCKED', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'BLOCKED');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid status transition');
    });

    it('should reject transition from PASS to any status', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: PASS
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'GAP');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid status transition');
      expect(result.message).toContain('PASS');
    });

    it('should reject transition from WIP to GAP', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: WIP
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'GAP');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid status transition');
    });
  });

  describe('notes handling', () => {
    it('should include notes in success message', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: WIP
persona: coder
dependencies: []
blocks: []
files: []
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(
        config,
        resolvedId,
        'PASS',
        'Completed in PR paulbreuler/limps#116'
      );

      expect(result.success).toBe(true);
      expect(result.message).toContain('Notes: Completed in PR paulbreuler/limps#116');
    });
  });

  describe('updated timestamp', () => {
    it('should update the updated field to current date', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      const agentPath = join(agentsDir, '000_agent.agent.md');
      writeFileSync(
        agentPath,
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
created: "2024-01-01"
---

# Test Agent
`,
        'utf-8'
      );

      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: agentPath,
      };

      const result = updateAgentStatus(config, resolvedId, 'WIP');

      expect(result.success).toBe(true);

      const updatedContent = readFileSync(agentPath, 'utf-8');
      const today = new Date().toISOString().split('T')[0];
      expect(updatedContent).toContain(`updated: ${today}`);
    });
  });

  describe('error handling', () => {
    it('should handle missing agent file', () => {
      const resolvedId: ResolvedTaskId = {
        taskId: '0001-test-plan#000',
        planFolder: '0001-test-plan',
        agentNumber: '000',
        path: join(plansDir, '0001-test-plan', 'agents', '000_agent.agent.md'),
      };

      const result = updateAgentStatus(config, resolvedId, 'WIP');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Failed to read agent file');
    });
  });
});
