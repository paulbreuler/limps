import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { parse as parseYaml } from 'yaml';
import {
  repairPlanFrontmatter,
  inspectPlanFrontmatter,
  inspectAgentFrontmatter,
  repairAgentFrontmatter,
} from '../../src/cli/plan-repair.js';

describe('plan-repair', () => {
  let testDir: string;
  let planFilePath: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-cli-plan-repair-${Date.now()}`);
    const planDir = join(testDir, 'plans', '0001-plan');
    mkdirSync(planDir, { recursive: true });
    planFilePath = join(planDir, '0001-plan-plan.md');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  it('repairs malformed frontmatter while preserving priority/severity', () => {
    writeFileSync(
      planFilePath,
      `---
priority: high
severity: medium
invalid: [oops
---

# Plan
`,
      'utf-8'
    );

    const result = repairPlanFrontmatter(planFilePath);
    expect(result.repaired).toBe(true);
    if (result.repaired) {
      expect(result.priority).toBe('high');
      expect(result.severity).toBe('medium');
    }

    const repaired = readFileSync(planFilePath, 'utf-8');
    expect(repaired).toContain('priority: high');
    expect(repaired).toContain('severity: medium');
    expect(repaired).not.toContain('invalid: [oops');
  });

  it('reports invalid priority/severity values', () => {
    writeFileSync(
      planFilePath,
      `---
priority: urgent
severity: trivial
---

# Plan
`,
      'utf-8'
    );

    const inspection = inspectPlanFrontmatter(readFileSync(planFilePath, 'utf-8'));
    expect(inspection.status).toBe('needs_repair');
    expect(inspection.issues.some((issue) => issue.code === 'invalid_priority')).toBe(true);
    expect(inspection.issues.some((issue) => issue.code === 'invalid_severity')).toBe(true);
  });

  it('skips valid frontmatter', () => {
    writeFileSync(
      planFilePath,
      `---
priority: low
severity: low
---

# Plan
`,
      'utf-8'
    );

    const result = repairPlanFrontmatter(planFilePath);
    expect(result.repaired).toBe(false);
    if (!result.repaired) {
      expect(result.reason).toBe('valid');
    }
  });

  describe('repairAgentFrontmatter', () => {
    let agentFilePath: string;

    beforeEach(() => {
      const agentsDir = join(testDir, 'plans', '0001-plan', 'agents');
      mkdirSync(agentsDir, { recursive: true });
      agentFilePath = join(agentsDir, '001-entity-resolution.agent.md');
    });

    it('rewrites bare depends: to depends_on:', () => {
      writeFileSync(
        agentFilePath,
        `---
title: Entity Resolution
status: GAP
persona: coder
depends: [1, 2]
---

# Agent 1: Entity Resolution
`,
        'utf-8'
      );

      const result = repairAgentFrontmatter(agentFilePath);
      expect(result.repaired).toBe(true);
      if (result.repaired) {
        expect(result.renamedKeys).toContain('depends');
      }

      const repaired = readFileSync(agentFilePath, 'utf-8');
      expect(repaired).toContain('depends_on');
      expect(repaired).not.toMatch(/^depends:/m);
    });

    it('merges depends: into existing depends_on:', () => {
      writeFileSync(
        agentFilePath,
        `---
title: Entity Resolution
status: GAP
persona: coder
depends_on: [0]
depends: [1]
---

# Agent 1: Entity Resolution
`,
        'utf-8'
      );

      const result = repairAgentFrontmatter(agentFilePath);
      expect(result.repaired).toBe(true);

      const repaired = readFileSync(agentFilePath, 'utf-8');
      expect(repaired).toContain('depends_on');
      expect(repaired).not.toMatch(/^depends:/m);
      // Parse back to verify the merged values
      const fmMatch = repaired.match(/^---\n([\s\S]*?)\n---/);
      expect(fmMatch).toBeTruthy();
      const parsed = parseYaml(fmMatch![1]) as Record<string, unknown>;
      expect(parsed.depends_on).toContain('000');
      expect(parsed.depends_on).toContain('001');
    });

    it('catches deps: and depend: too', () => {
      writeFileSync(
        agentFilePath,
        `---
title: Hybrid Retrieval
status: GAP
persona: coder
deps: [3]
---

# Agent 2: Hybrid Retrieval
`,
        'utf-8'
      );

      const result = repairAgentFrontmatter(agentFilePath);
      expect(result.repaired).toBe(true);
      if (result.repaired) {
        expect(result.renamedKeys).toContain('deps');
      }

      const repaired = readFileSync(agentFilePath, 'utf-8');
      expect(repaired).toContain('depends_on');
      expect(repaired).not.toMatch(/^deps:/m);
    });

    it('skips clean agent files', () => {
      writeFileSync(
        agentFilePath,
        `---
title: Entity Schema
status: GAP
persona: coder
depends_on: [0]
---

# Agent 0: Entity Schema
`,
        'utf-8'
      );

      const result = repairAgentFrontmatter(agentFilePath);
      expect(result.repaired).toBe(false);
      if (!result.repaired) {
        expect(result.reason).toBe('clean');
      }
    });
  });

  describe('inspectAgentFrontmatter', () => {
    it('detects bad dependency keys without modifying', () => {
      const content = `---
title: Entity Resolution
status: GAP
persona: coder
depends: [1]
---

# Agent 1: Entity Resolution
`;

      const inspection = inspectAgentFrontmatter(content);
      expect(inspection.status).toBe('needs_repair');
      expect(inspection.badKeys).toContain('depends');
      expect(inspection.issues.length).toBeGreaterThan(0);
      expect(inspection.issues[0].key).toBe('depends');
    });

    it('reports valid when depends_on is used correctly', () => {
      const content = `---
title: Entity Schema
status: GAP
persona: coder
depends_on: [0]
---

# Agent 0: Entity Schema
`;

      const inspection = inspectAgentFrontmatter(content);
      expect(inspection.status).toBe('valid');
      expect(inspection.badKeys).toHaveLength(0);
      expect(inspection.issues).toHaveLength(0);
    });

    it('reports valid for files with no frontmatter', () => {
      const content = `# Agent 0: No Frontmatter\n\nSome content.\n`;

      const inspection = inspectAgentFrontmatter(content);
      expect(inspection.status).toBe('valid');
    });
  });
});
