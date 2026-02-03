/**
 * Tests for health-drift module - code drift detection.
 *
 * TDD: RED phase - these tests define the expected behavior.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkFileDrift, normalizeFilePath, findSimilarFile } from '../../src/cli/health-drift.js';
import type { ServerConfig } from '../../src/config.js';

describe('health-drift', () => {
  let testDir: string;
  let plansDir: string;
  let codebaseDir: string;
  let config: ServerConfig;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-health-drift-${Date.now()}`);
    plansDir = join(testDir, 'plans');
    codebaseDir = join(testDir, 'codebase');
    mkdirSync(plansDir, { recursive: true });
    mkdirSync(codebaseDir, { recursive: true });

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

  describe('normalizeFilePath', () => {
    it('extracts path from string entry [drift-001]', () => {
      const result = normalizeFilePath('src/config.ts');
      expect(result).toBe('src/config.ts');
    });

    it('extracts path from object entry [drift-002]', () => {
      const result = normalizeFilePath({ path: 'src/config.ts', action: 'modify' });
      expect(result).toBe('src/config.ts');
    });

    it('returns null for object with repo field [drift-003]', () => {
      // External repo files should be skipped
      const result = normalizeFilePath({ path: 'src/config.ts', repo: 'external-repo' });
      expect(result).toBeNull();
    });

    it('handles empty string [drift-004]', () => {
      const result = normalizeFilePath('');
      expect(result).toBeNull();
    });

    it('handles object without path [drift-005]', () => {
      const result = normalizeFilePath({ action: 'modify' } as { path: string });
      expect(result).toBeNull();
    });
  });

  describe('findSimilarFile', () => {
    beforeEach(() => {
      // Create some files in the codebase
      mkdirSync(join(codebaseDir, 'src'), { recursive: true });
      writeFileSync(join(codebaseDir, 'src', 'config.ts'), 'export const config = {};');
      writeFileSync(join(codebaseDir, 'src', 'configuration.ts'), 'export const cfg = {};');
      writeFileSync(join(codebaseDir, 'src', 'settings.ts'), 'export const settings = {};');
    });

    it('finds exact filename match in different directory [drift-010]', () => {
      // Looking for utils/config.ts but config.ts exists in src/
      const result = findSimilarFile(codebaseDir, 'config.ts');
      expect(result).toBe('src/config.ts');
    });

    it('finds similar filename (fuzzy match) [drift-011]', () => {
      // Looking for config.tsx but config.ts exists
      const result = findSimilarFile(codebaseDir, 'config.tsx');
      expect(result).toBe('src/config.ts');
    });

    it('returns null when no similar file found [drift-012]', () => {
      const result = findSimilarFile(codebaseDir, 'completely-unrelated.ts');
      expect(result).toBeNull();
    });

    it('prefers exact filename match over fuzzy match [drift-013]', () => {
      // Should prefer config.ts over configuration.ts
      const result = findSimilarFile(codebaseDir, 'config.ts');
      expect(result).toBe('src/config.ts');
    });
  });

  describe('checkFileDrift', () => {
    it('returns empty array when all files exist [drift-020]', () => {
      // Setup: Create plan with agent
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      // Create the actual files in codebase
      mkdirSync(join(codebaseDir, 'src'), { recursive: true });
      writeFileSync(join(codebaseDir, 'src', 'file1.ts'), 'content');
      writeFileSync(join(codebaseDir, 'src', 'file2.ts'), 'content');

      // Create agent referencing those files
      writeFileSync(
        join(agentsDir, '000_agent_test.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/file1.ts
  - src/file2.ts
---

# Agent 0: Test Agent
`,
        'utf-8'
      );

      const result = checkFileDrift(config, '1', codebaseDir);

      expect(result.drifts).toHaveLength(0);
      expect(result.totalFilesChecked).toBe(2);
    });

    it('detects missing files [drift-021]', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      // Only create one file
      mkdirSync(join(codebaseDir, 'src'), { recursive: true });
      writeFileSync(join(codebaseDir, 'src', 'file1.ts'), 'content');

      // Agent references two files, one doesn't exist
      writeFileSync(
        join(agentsDir, '000_agent_test.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/file1.ts
  - src/missing-file.ts
---

# Agent 0: Test Agent
`,
        'utf-8'
      );

      const result = checkFileDrift(config, '1', codebaseDir);

      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0]).toMatchObject({
        agentNumber: '000',
        listedFile: 'src/missing-file.ts',
        reason: 'missing',
      });
    });

    it('suggests renamed files [drift-022]', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      // Create file with similar name
      mkdirSync(join(codebaseDir, 'src'), { recursive: true });
      writeFileSync(join(codebaseDir, 'src', 'config.ts'), 'content');

      // Agent references old filename
      writeFileSync(
        join(agentsDir, '000_agent_test.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/configuration.ts
---

# Agent 0: Test Agent
`,
        'utf-8'
      );

      const result = checkFileDrift(config, '1', codebaseDir);

      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0]).toMatchObject({
        listedFile: 'src/configuration.ts',
        reason: 'renamed',
      });
      expect(result.drifts[0].suggestion).toBe('src/config.ts');
    });

    it('handles object-style file entries [drift-023]', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      mkdirSync(join(codebaseDir, 'src'), { recursive: true });
      writeFileSync(join(codebaseDir, 'src', 'file1.ts'), 'content');

      // Agent with object-style file entries
      writeFileSync(
        join(agentsDir, '000_agent_test.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - path: src/file1.ts
    action: modify
  - path: src/missing.ts
    action: create
---

# Agent 0: Test Agent
`,
        'utf-8'
      );

      const result = checkFileDrift(config, '1', codebaseDir);

      // Should only flag missing.ts, not file1.ts
      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0].listedFile).toBe('src/missing.ts');
    });

    it('skips external repo files [drift-024]', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      // Agent references external repo file - should be skipped
      writeFileSync(
        join(agentsDir, '000_agent_test.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - path: src/external.ts
    repo: external-repo
---

# Agent 0: Test Agent
`,
        'utf-8'
      );

      const result = checkFileDrift(config, '1', codebaseDir);

      expect(result.drifts).toHaveLength(0);
      expect(result.totalFilesChecked).toBe(0);
      expect(result.skippedExternal).toBe(1);
    });

    it('checks specific agent when agentNumber provided [drift-025]', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      mkdirSync(join(codebaseDir, 'src'), { recursive: true });

      // Create two agents with missing files
      writeFileSync(
        join(agentsDir, '000_agent_first.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/missing1.ts
---

# Agent 0: First
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '001_agent_second.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/missing2.ts
---

# Agent 1: Second
`,
        'utf-8'
      );

      // Check only agent 001
      const result = checkFileDrift(config, '1', codebaseDir, '001');

      expect(result.drifts).toHaveLength(1);
      expect(result.drifts[0].agentNumber).toBe('001');
      expect(result.drifts[0].listedFile).toBe('src/missing2.ts');
    });

    it('returns error for non-existent plan [drift-026]', () => {
      const result = checkFileDrift(config, '999', codebaseDir);

      expect(result.error).toBe('Plan not found: 999');
      expect(result.drifts).toHaveLength(0);
    });

    it('returns error when codebasePath contains path traversal [drift-026b]', () => {
      // Use a path string that literally contains ".." (path.join would resolve it)
      const result = checkFileDrift(config, '1', 'codebase/../etc');

      expect(result.error).toContain('path traversal');
      expect(result.drifts).toHaveLength(0);
    });

    it('handles agents with empty files array [drift-027]', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent_test.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files: []
---

# Agent 0: Test Agent
`,
        'utf-8'
      );

      const result = checkFileDrift(config, '1', codebaseDir);

      expect(result.drifts).toHaveLength(0);
      expect(result.totalFilesChecked).toBe(0);
    });

    it('aggregates drift across multiple agents [drift-028]', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      mkdirSync(join(codebaseDir, 'src'), { recursive: true });

      // Create two agents with missing files
      writeFileSync(
        join(agentsDir, '000_agent_first.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/missing1.ts
---

# Agent 0: First
`,
        'utf-8'
      );

      writeFileSync(
        join(agentsDir, '001_agent_second.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/missing2.ts
  - src/missing3.ts
---

# Agent 1: Second
`,
        'utf-8'
      );

      const result = checkFileDrift(config, '1', codebaseDir);

      expect(result.drifts).toHaveLength(3);
      expect(result.agentsChecked).toBe(2);
      expect(result.totalFilesChecked).toBe(3);
    });

    it('includes agent title in drift entries [drift-029]', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent_test.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/missing.ts
---

# Agent 0: My Important Agent
`,
        'utf-8'
      );

      const result = checkFileDrift(config, '1', codebaseDir);

      expect(result.drifts[0].agentTitle).toBe('My Important Agent');
    });

    it('includes task ID in drift entries [drift-030]', () => {
      const planDir = join(plansDir, '0001-test-plan');
      const agentsDir = join(planDir, 'agents');
      mkdirSync(agentsDir, { recursive: true });

      writeFileSync(
        join(agentsDir, '000_agent_test.agent.md'),
        `---
status: GAP
persona: coder
dependencies: []
blocks: []
files:
  - src/missing.ts
---

# Agent 0: Test
`,
        'utf-8'
      );

      const result = checkFileDrift(config, '1', codebaseDir);

      expect(result.drifts[0].taskId).toBe('0001-test-plan#000');
    });
  });
});
