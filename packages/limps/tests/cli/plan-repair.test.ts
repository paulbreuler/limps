import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { repairPlanFrontmatter, inspectPlanFrontmatter } from '../../src/cli/plan-repair.js';

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
});
