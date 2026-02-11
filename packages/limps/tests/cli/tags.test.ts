/**
 * Tests for tags CLI commands.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { execSync } from 'child_process';

// Test directory
const TEST_DIR = join(process.cwd(), '.tmp', 'tags-cli-test');
const TEST_REPO_ROOT = join(TEST_DIR, 'repo');
const TEST_DATA_DIR = join(TEST_DIR, 'data');
const CONFIG_PATH = join(TEST_DIR, 'config.json');

// Path to limps CLI
const LIMPS_CLI = join(process.cwd(), 'dist', 'cli.js');

describe('docs tags CLI commands', () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
    mkdirSync(TEST_REPO_ROOT, { recursive: true });
    mkdirSync(TEST_DATA_DIR, { recursive: true });

    // Create test config
    const config = {
      plansPath: join(TEST_REPO_ROOT, 'plans'),
      docsPaths: [TEST_REPO_ROOT],
      fileExtensions: ['.md'],
      dataPath: TEST_DATA_DIR,
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };
    writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf-8');
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true, force: true });
    }
  });

  describe('limps docs tags list', () => {
    it('lists tags from frontmatter', () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
tags:
  - project
  - important
---
# Content
`,
        'utf-8'
      );

      const result = execSync(
        `node ${LIMPS_CLI} docs tags list plans/test.md --config ${CONFIG_PATH} --json`,
        {
          encoding: 'utf-8',
        }
      );

      const envelope = JSON.parse(result);
      expect(envelope.success).toBe(true);
      const output = envelope.data;
      expect(output.operation).toBe('list');
      expect(output.tags).toContain('project');
      expect(output.tags).toContain('important');
      expect(output.success).toBe(true);
    });

    it('lists inline tags from content', () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
---
# Content

This has #inline-tag and #another-tag in the content.
`,
        'utf-8'
      );

      const result = execSync(
        `node ${LIMPS_CLI} docs tags list plans/test.md --config ${CONFIG_PATH} --json`,
        {
          encoding: 'utf-8',
        }
      );

      const envelope = JSON.parse(result);
      expect(envelope.success).toBe(true);
      const output = envelope.data;
      expect(output.tags).toContain('inline-tag');
      expect(output.tags).toContain('another-tag');
    });
  });

  describe('limps docs tags add', () => {
    it('adds tags to document', () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
tags:
  - existing
---
# Content
`,
        'utf-8'
      );

      const result = execSync(
        `node ${LIMPS_CLI} docs tags add plans/test.md --tags new-tag another-tag --config ${CONFIG_PATH} --json`,
        {
          encoding: 'utf-8',
        }
      );

      const envelope = JSON.parse(result);
      expect(envelope.success).toBe(true);
      const output = envelope.data;
      expect(output.success).toBe(true);
      expect(output.tags).toContain('existing');
      expect(output.tags).toContain('new-tag');
      expect(output.tags).toContain('another-tag');

      // Verify file was updated
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('new-tag');
      expect(content).toContain('another-tag');
    });

    it('handles document without frontmatter', () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `# Content

Has #inline-tag here.
`,
        'utf-8'
      );

      const result = execSync(
        `node ${LIMPS_CLI} docs tags add plans/test.md --tags new-tag --config ${CONFIG_PATH} --json`,
        {
          encoding: 'utf-8',
        }
      );

      const envelope = JSON.parse(result);
      expect(envelope.success).toBe(true);
      const output = envelope.data;
      expect(output.success).toBe(true);
      expect(output.tags).toContain('inline-tag');
      expect(output.tags).toContain('new-tag');

      // Verify frontmatter was added
      const content = readFileSync(filePath, 'utf-8');
      expect(content).toContain('---');
      expect(content).toContain('new-tag');
    });
  });

  describe('limps docs tags remove', () => {
    it('removes tags from document', () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
tags:
  - keep
  - remove
  - also-remove
---
# Content
`,
        'utf-8'
      );

      const result = execSync(
        `node ${LIMPS_CLI} docs tags remove plans/test.md --tags remove also-remove --config ${CONFIG_PATH} --json`,
        {
          encoding: 'utf-8',
        }
      );

      const envelope = JSON.parse(result);
      expect(envelope.success).toBe(true);
      const output = envelope.data;
      expect(output.success).toBe(true);
      expect(output.tags).toContain('keep');
      expect(output.tags).not.toContain('remove');
      expect(output.tags).not.toContain('also-remove');
    });

    it('removes all tags when no tags remain', () => {
      const filePath = join(TEST_REPO_ROOT, 'plans', 'test.md');
      mkdirSync(dirname(filePath), { recursive: true });
      writeFileSync(
        filePath,
        `---
title: Test
tags:
  - only-tag
---
# Content
`,
        'utf-8'
      );

      const result = execSync(
        `node ${LIMPS_CLI} docs tags remove plans/test.md --tags only-tag --config ${CONFIG_PATH} --json`,
        {
          encoding: 'utf-8',
        }
      );

      const envelope = JSON.parse(result);
      expect(envelope.success).toBe(true);
      const output = envelope.data;
      expect(output.success).toBe(true);
      expect(output.tags).toHaveLength(0);
    });
  });
});
