import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkFdBudget, estimateWatchEntries, getFdLimit } from '../../src/utils/fd-safety.js';

describe('fd-safety', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-fd-safety-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getFdLimit', () => {
    it('returns a positive number', () => {
      const limit = getFdLimit();
      expect(limit).toBeGreaterThan(0);
    });

    it('returns fallback when getrlimit is unavailable', () => {
      const original = (process as Record<string, unknown>).getrlimit;
      (process as Record<string, unknown>).getrlimit = undefined;
      try {
        const limit = getFdLimit();
        // Should fall back to ulimit or the 256 default
        expect(limit).toBeGreaterThan(0);
      } finally {
        (process as Record<string, unknown>).getrlimit = original;
      }
    });
  });

  describe('estimateWatchEntries', () => {
    it('counts files and directories in a small tree', () => {
      // Create: testDir/a.md, testDir/sub/b.md
      writeFileSync(join(testDir, 'a.md'), '# A');
      const subDir = join(testDir, 'sub');
      mkdirSync(subDir);
      writeFileSync(join(subDir, 'b.md'), '# B');

      const count = estimateWatchEntries([testDir], 10, []);
      // testDir(1) + a.md(1) + sub(1) + b.md(1) = 4
      expect(count).toBe(4);
    });

    it('respects ignore patterns', () => {
      mkdirSync(join(testDir, 'node_modules'));
      writeFileSync(join(testDir, 'node_modules', 'pkg.js'), '');
      writeFileSync(join(testDir, 'readme.md'), '# Hi');

      const count = estimateWatchEntries([testDir], 10, ['node_modules']);
      // testDir(1) + readme.md(1) = 2  (node_modules and its contents ignored)
      expect(count).toBe(2);
    });

    it('respects maxDepth', () => {
      const deep = join(testDir, 'a', 'b', 'c');
      mkdirSync(deep, { recursive: true });
      writeFileSync(join(deep, 'deep.md'), '# Deep');

      const shallow = estimateWatchEntries([testDir], 1, []);
      const full = estimateWatchEntries([testDir], 10, []);

      expect(shallow).toBeLessThan(full);
    });

    it('skips dotfiles and dotdirs', () => {
      writeFileSync(join(testDir, '.hidden'), 'secret');
      mkdirSync(join(testDir, '.git'));
      writeFileSync(join(testDir, 'visible.md'), '# Visible');

      const count = estimateWatchEntries([testDir], 10, []);
      // testDir(1) + visible.md(1) = 2
      expect(count).toBe(2);
    });

    it('handles non-existent paths gracefully', () => {
      const count = estimateWatchEntries([join(testDir, 'nonexistent')], 10, []);
      // The root dir stat fails so we get 0 (or 1 if it counts the attempt)
      expect(count).toBeGreaterThanOrEqual(0);
    });

    it('handles multiple root paths', () => {
      const dir2 = join(tmpdir(), `test-fd-safety2-${Date.now()}`);
      mkdirSync(dir2, { recursive: true });
      writeFileSync(join(testDir, 'a.md'), '');
      writeFileSync(join(dir2, 'b.md'), '');

      try {
        const count = estimateWatchEntries([testDir, dir2], 10, []);
        // testDir(1) + a.md(1) + dir2(1) + b.md(1) = 4
        expect(count).toBe(4);
      } finally {
        rmSync(dir2, { recursive: true, force: true });
      }
    });
  });

  describe('checkFdBudget', () => {
    it('returns safe for a small directory', () => {
      writeFileSync(join(testDir, 'a.md'), '');

      const result = checkFdBudget([testDir], 10, []);

      expect(result.safe).toBe(true);
      expect(result.limit).toBeGreaterThan(0);
      expect(result.estimated).toBe(2); // dir + file
    });

    it('returns unsafe when limit is artificially low', () => {
      // Create enough entries to exceed a limit of 3 at 70% threshold (>2.1)
      writeFileSync(join(testDir, 'a.md'), '');
      writeFileSync(join(testDir, 'b.md'), '');
      writeFileSync(join(testDir, 'c.md'), '');

      // Mock getFdLimit by mocking process.getrlimit and execSync
      const original = (process as Record<string, unknown>).getrlimit;
      (process as Record<string, unknown>).getrlimit = (
        resource: string
      ): { soft: number; hard: number } => {
        if (resource === 'nofile') return { soft: 3, hard: 3 };
        throw new Error('unknown resource');
      };

      try {
        const result = checkFdBudget([testDir], 10, []);
        // estimated = 4 (dir + 3 files), limit = 3, 4 > 3*0.7 = 2.1 → unsafe
        expect(result.safe).toBe(false);
        expect(result.estimated).toBe(4);
        expect(result.limit).toBe(3);
      } finally {
        (process as Record<string, unknown>).getrlimit = original;
      }
    });
  });
});
