import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { getAgentStatusSummary } from '../../src/cli/status.js';
import type { CoordinationState } from '../../src/coordination.js';
import type { ServerConfig } from '../../src/config.js';
import type { ResolvedTaskId } from '../../src/cli/task-resolver.js';

describe('agent-status', () => {
  let testDir: string;
  let plansPath: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(
      tmpdir(),
      `test-agent-status-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    plansPath = join(testDir, 'plans');
    mkdirSync(plansPath, { recursive: true });

    config = {
      plansPath,
      dataPath: join(testDir, 'data'),
      coordinationPath: join(testDir, 'coordination.json'),
      heartbeatTimeout: 300000,
      debounceDelay: 200,
      maxHandoffIterations: 3,
    };
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  function createAgentFile(planName: string, agentNum: string, content: string): string {
    const planDir = join(plansPath, planName);
    const agentsDir = join(planDir, 'agents');
    mkdirSync(agentsDir, { recursive: true });

    const fileName = `${agentNum}_agent_test.agent.md`;
    const filePath = join(agentsDir, fileName);
    writeFileSync(filePath, content, 'utf-8');
    return filePath;
  }

  describe('getAgentStatusSummary', () => {
    it('returns basic agent info', () => {
      const agentContent = `---
status: GAP
persona: coder
claimedBy: null
dependencies: []
blocks: []
files:
  - src/foo.ts
  - src/bar.ts
---

# Agent 001: Test Feature

Some description.

## Feature #1

Status: \`GAP\`
`;

      const filePath = createAgentFile('0001-test-plan', '001', agentContent);
      const resolvedId: ResolvedTaskId = {
        planFolder: '0001-test-plan',
        agentNumber: '001',
        taskId: '0001-test-plan#001',
        path: filePath,
      };
      const coordination: CoordinationState = {
        version: 1,
        agents: {},
        tasks: {},
        fileLocks: {},
      };

      const result = getAgentStatusSummary(config, resolvedId, coordination);

      expect(result.taskId).toBe('0001-test-plan#001');
      expect(result.agentNumber).toBe('001');
      expect(result.status).toBe('GAP');
      expect(result.persona).toBe('coder');
      expect(result.title).toBe('Test Feature');
    });

    it('parses feature counts from content', () => {
      const agentContent = `---
status: WIP
persona: coder
claimedBy: null
dependencies: []
blocks: []
files: []
---

# Agent 001

## Feature #1
Status: \`PASS\`

## Feature #2
Status: \`WIP\`

## Feature #3
Status: \`GAP\`

## Feature #4
Status: \`BLOCKED\`
`;

      const filePath = createAgentFile('0001-test-plan', '001', agentContent);
      const resolvedId: ResolvedTaskId = {
        planFolder: '0001-test-plan',
        agentNumber: '001',
        taskId: '0001-test-plan#001',
        path: filePath,
      };
      const coordination: CoordinationState = {
        version: 1,
        agents: {},
        tasks: {},
        fileLocks: {},
      };

      const result = getAgentStatusSummary(config, resolvedId, coordination);

      expect(result.features.total).toBe(4);
      expect(result.features.pass).toBe(1);
      expect(result.features.wip).toBe(1);
      expect(result.features.gap).toBe(1);
      expect(result.features.blocked).toBe(1);
    });

    it('includes file lock status', () => {
      const agentContent = `---
status: GAP
persona: coder
claimedBy: null
dependencies: []
blocks: []
files:
  - src/locked.ts
  - src/unlocked.ts
---

# Agent 001
`;

      const filePath = createAgentFile('0001-test-plan', '001', agentContent);
      const resolvedId: ResolvedTaskId = {
        planFolder: '0001-test-plan',
        agentNumber: '001',
        taskId: '0001-test-plan#001',
        path: filePath,
      };
      const coordination: CoordinationState = {
        version: 1,
        agents: {},
        tasks: {},
        fileLocks: {
          'src/locked.ts': 'other-agent',
        },
      };

      const result = getAgentStatusSummary(config, resolvedId, coordination);

      expect(result.files).toHaveLength(2);
      expect(result.files.find((f) => f.path === 'src/locked.ts')?.locked).toBe(true);
      expect(result.files.find((f) => f.path === 'src/locked.ts')?.lockedBy).toBe('other-agent');
      expect(result.files.find((f) => f.path === 'src/unlocked.ts')?.locked).toBe(false);
    });

    it('includes dependency status', () => {
      // Create the dependency agent first
      const dep000Content = `---
status: PASS
persona: coder
claimedBy: null
dependencies: []
blocks: ["001"]
files: []
---

# Agent 000: Foundation
`;
      createAgentFile('0001-test-plan', '000', dep000Content);

      const agentContent = `---
status: GAP
persona: coder
claimedBy: null
dependencies: ["000"]
blocks: []
files: []
---

# Agent 001: Dependent
`;

      const filePath = createAgentFile('0001-test-plan', '001', agentContent);
      const resolvedId: ResolvedTaskId = {
        planFolder: '0001-test-plan',
        agentNumber: '001',
        taskId: '0001-test-plan#001',
        path: filePath,
      };
      const coordination: CoordinationState = {
        version: 1,
        agents: {},
        tasks: {},
        fileLocks: {},
      };

      const result = getAgentStatusSummary(config, resolvedId, coordination);

      expect(result.dependencies).toHaveLength(1);
      expect(result.dependencies[0].taskId).toBe('0001-test-plan#000');
      expect(result.dependencies[0].status).toBe('PASS');
      expect(result.dependencies[0].satisfied).toBe(true);
    });

    it('includes claim and heartbeat info', () => {
      const agentContent = `---
status: WIP
persona: coder
claimedBy: null
dependencies: []
blocks: []
files: []
---

# Agent 001
`;

      const filePath = createAgentFile('0001-test-plan', '001', agentContent);
      const resolvedId: ResolvedTaskId = {
        planFolder: '0001-test-plan',
        agentNumber: '001',
        taskId: '0001-test-plan#001',
        path: filePath,
      };
      const coordination: CoordinationState = {
        version: 1,
        agents: {
          'agent-1': {
            status: 'WIP',
            persona: 'coder',
            taskId: '0001-test-plan#001',
            filesLocked: [],
            heartbeat: new Date().toISOString(),
          },
        },
        tasks: {
          '0001-test-plan#001': {
            status: 'WIP',
            claimedBy: 'agent-1',
            dependencies: [],
          },
        },
        fileLocks: {},
      };

      const result = getAgentStatusSummary(config, resolvedId, coordination);

      expect(result.claimed).toBeDefined();
      expect(result.claimed?.by).toBe('agent-1');
      expect(result.heartbeat).toBeDefined();
      expect(result.heartbeat?.stale).toBe(false);
    });
  });
});
