import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { listAgents, findPlanDirectory, getAgentFiles } from '../../src/cli/list-agents.js';
import type { ServerConfig } from '../../src/config.js';

describe('list-agents', () => {
  let testDir: string;
  let plansDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-list-agents-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    mkdirSync(plansDir, { recursive: true });

    config = {
      plansPath: plansDir,
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

  describe('findPlanDirectory', () => {
    it('finds plan by number', () => {
      const planDir = join(plansDir, '0004-test-plan');
      mkdirSync(planDir, { recursive: true });

      const result = findPlanDirectory(plansDir, '4');

      expect(result).toBe(planDir);
    });

    it('finds plan by padded number', () => {
      const planDir = join(plansDir, '0004-test-plan');
      mkdirSync(planDir, { recursive: true });

      const result = findPlanDirectory(plansDir, '0004');

      expect(result).toBe(planDir);
    });

    it('finds plan by full name', () => {
      const planDir = join(plansDir, '0004-test-plan');
      mkdirSync(planDir, { recursive: true });

      const result = findPlanDirectory(plansDir, '0004-test-plan');

      expect(result).toBe(planDir);
    });

    it('returns null when plan not found', () => {
      const result = findPlanDirectory(plansDir, '99');

      expect(result).toBeNull();
    });
  });

  describe('getAgentFiles', () => {
    it('returns parsed agent files', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent_first.agent.md'),
        `---
status: GAP
persona: coder
claimedBy: null
dependencies: []
blocks: []
files:
  - src/file1.ts
---

# Agent 0: First Agent

Description here.
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '001_agent_second.agent.md'),
        `---
status: WIP
persona: reviewer
claimedBy: agent-1
dependencies:
  - "000"
blocks: []
files:
  - src/file2.ts
---

# Agent 1: Second Agent

Another description.
`,
        'utf-8'
      );

      const agents = getAgentFiles(planDir);

      expect(agents).toHaveLength(2);
      expect(agents[0].agentNumber).toBe('000');
      expect(agents[0].frontmatter.status).toBe('GAP');
      expect(agents[1].agentNumber).toBe('001');
      expect(agents[1].frontmatter.status).toBe('WIP');
    });

    it('returns empty array when no agents directory', () => {
      const planDir = join(plansDir, '0004-test-plan');
      mkdirSync(planDir, { recursive: true });

      const agents = getAgentFiles(planDir);

      expect(agents).toHaveLength(0);
    });
  });

  describe('listAgents', () => {
    it('lists agents with status counts', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent_first.agent.md'),
        `---
status: PASS
persona: coder
claimedBy: null
dependencies: []
blocks: []
files: []
---

# Agent 0: First Agent
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '001_agent_second.agent.md'),
        `---
status: GAP
persona: coder
claimedBy: null
dependencies: []
blocks: []
files: []
---

# Agent 1: Second Agent
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '002_agent_third.agent.md'),
        `---
status: GAP
persona: reviewer
claimedBy: null
dependencies: []
blocks: []
files: []
---

# Agent 2: Third Agent
`,
        'utf-8'
      );

      const output = listAgents(config, '4');

      expect(output).toContain('000');
      expect(output).toContain('001');
      expect(output).toContain('002');
      expect(output).toContain('PASS: 1');
      expect(output).toContain('GAP: 2');
      expect(output).toContain('Total: 3');
    });

    it('handles plan not found', () => {
      expect(() => listAgents(config, '99')).toThrow('Plan not found: 99');
    });

    it('shows no agents message', () => {
      const planDir = join(plansDir, '0005-empty-plan');
      mkdirSync(planDir, { recursive: true });

      const output = listAgents(config, '5');

      expect(output).toContain('No agents found');
    });

    it('shows status icons', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: GAP
persona: coder
claimedBy: null
dependencies: []
blocks: []
files: []
---

# Agent 0
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '001_agent.agent.md'),
        `---
status: WIP
persona: coder
claimedBy: null
dependencies: []
blocks: []
files: []
---

# Agent 1
`,
        'utf-8'
      );

      const output = listAgents(config, '4');

      expect(output).toContain('[ ]'); // GAP
      expect(output).toContain('[*]'); // WIP
    });

    it('shows dependency and file counts', () => {
      const planDir = join(plansDir, '0004-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent.agent.md'),
        `---
status: GAP
persona: coder
claimedBy: null
dependencies:
  - "001"
  - "002"
blocks: []
files:
  - src/a.ts
  - src/b.ts
  - src/c.ts
---

# Agent 0
`,
        'utf-8'
      );

      const output = listAgents(config, '4');

      expect(output).toContain('Dependencies: 2');
      expect(output).toContain('Files: 3');
    });
  });
});
