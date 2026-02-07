import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { writeFileSync, symlinkSync, mkdirSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { checkPathSafety, isSymlink } from '../../src/utils/fs-safety.js';

describe('fs-safety', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-fs-safety-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('checkPathSafety', () => {
    it('allows regular files', () => {
      const filePath = join(testDir, 'regular.md');
      writeFileSync(filePath, '# Test', 'utf-8');

      const result = checkPathSafety(filePath);

      expect(result.safe).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('rejects symbolic links', () => {
      const targetPath = join(testDir, 'target.md');
      const linkPath = join(testDir, 'link.md');
      writeFileSync(targetPath, '# Target', 'utf-8');
      symlinkSync(targetPath, linkPath);

      const result = checkPathSafety(linkPath);

      expect(result.safe).toBe(false);
      expect(result.reason).toBe('symbolic link');
    });

    it('rejects files exceeding maxFileSize', () => {
      const filePath = join(testDir, 'large.md');
      // Create a file slightly over 100 bytes
      writeFileSync(filePath, 'x'.repeat(101), 'utf-8');

      const result = checkPathSafety(filePath, { maxFileSize: 100 });

      expect(result.safe).toBe(false);
      expect(result.reason).toContain('file size');
      expect(result.reason).toContain('exceeds limit');
    });

    it('allows files under maxFileSize', () => {
      const filePath = join(testDir, 'small.md');
      writeFileSync(filePath, 'x'.repeat(50), 'utf-8');

      const result = checkPathSafety(filePath, { maxFileSize: 100 });

      expect(result.safe).toBe(true);
    });

    it('returns unsafe for non-existent paths', () => {
      const result = checkPathSafety(join(testDir, 'nonexistent.md'));

      expect(result.safe).toBe(false);
      expect(result.reason).toBe('cannot stat file');
    });

    it('allows files when maxFileSize is not specified', () => {
      const filePath = join(testDir, 'any-size.md');
      writeFileSync(filePath, 'x'.repeat(1000), 'utf-8');

      const result = checkPathSafety(filePath);

      expect(result.safe).toBe(true);
    });
  });

  describe('isSymlink', () => {
    it('returns true for symbolic links', () => {
      const targetPath = join(testDir, 'target.md');
      const linkPath = join(testDir, 'link.md');
      writeFileSync(targetPath, '# Target', 'utf-8');
      symlinkSync(targetPath, linkPath);

      expect(isSymlink(linkPath)).toBe(true);
    });

    it('returns false for regular files', () => {
      const filePath = join(testDir, 'regular.md');
      writeFileSync(filePath, '# Regular', 'utf-8');

      expect(isSymlink(filePath)).toBe(false);
    });

    it('returns false for directories', () => {
      const dirPath = join(testDir, 'subdir');
      mkdirSync(dirPath);

      expect(isSymlink(dirPath)).toBe(false);
    });

    it('returns false for non-existent paths', () => {
      expect(isSymlink(join(testDir, 'nonexistent'))).toBe(false);
    });
  });
});
