/**
 * Tests for PathFilter class.
 */

import { describe, it, expect } from 'vitest';
import { PathFilter } from '../../src/utils/pathfilter.js';

describe('PathFilter', () => {
  describe('isAllowed', () => {
    it('allows regular markdown files', () => {
      const filter = new PathFilter();
      expect(filter.isAllowed('note.md')).toBe(true);
      expect(filter.isAllowed('plans/plan.md')).toBe(true);
    });

    it('blocks .obsidian directory', () => {
      const filter = new PathFilter();
      expect(filter.isAllowed('.obsidian/config.json')).toBe(false);
      expect(filter.isAllowed('.obsidian/workspace.json')).toBe(false);
    });

    it('blocks .obsidian with glob pattern', () => {
      const filter = new PathFilter();
      expect(filter.isAllowed('.obsidian/plugins/plugin.js')).toBe(false);
      expect(filter.isAllowed('subdir/.obsidian/config.json')).toBe(false);
    });

    it('blocks .git directory', () => {
      const filter = new PathFilter();
      expect(filter.isAllowed('.git/config')).toBe(false);
      expect(filter.isAllowed('.git/hooks/pre-commit')).toBe(false);
    });

    it('blocks node_modules', () => {
      const filter = new PathFilter();
      expect(filter.isAllowed('node_modules/package/index.js')).toBe(false);
    });

    it('blocks system files', () => {
      const filter = new PathFilter();
      expect(filter.isAllowed('.DS_Store')).toBe(false);
      expect(filter.isAllowed('Thumbs.db')).toBe(false);
    });

    it('allows only specified extensions when configured', () => {
      const filter = new PathFilter({
        allowedExtensions: ['.md', '.txt'],
      });

      expect(filter.isAllowed('file.md')).toBe(true);
      expect(filter.isAllowed('file.txt')).toBe(true);
      expect(filter.isAllowed('file.js')).toBe(false);
      expect(filter.isAllowed('file.json')).toBe(false);
    });

    it('handles custom ignored patterns', () => {
      const filter = new PathFilter({
        ignoredPatterns: ['custom/**', '*.tmp'],
      });

      expect(filter.isAllowed('custom/file.md')).toBe(false);
      expect(filter.isAllowed('file.tmp')).toBe(false);
      expect(filter.isAllowed('regular.md')).toBe(true);
    });

    it('distinguishes files from directories', () => {
      const filter = new PathFilter();

      // Files with extensions
      expect(filter.isAllowed('file.md')).toBe(true);
      expect(filter.isAllowed('file.txt')).toBe(true);

      // Directories (no extension or ending with /)
      expect(filter.isAllowed('directory/')).toBe(true); // Not a file, so extension check doesn't apply
      expect(filter.isAllowed('directory')).toBe(true); // No extension, treated as directory
    });
  });

  describe('filterPaths', () => {
    it('filters array of paths', () => {
      const filter = new PathFilter();
      const paths = ['note.md', '.obsidian/config.json', 'plan.md', '.git/config', 'another.md'];

      const filtered = filter.filterPaths(paths);

      expect(filtered).toEqual(['note.md', 'plan.md', 'another.md']);
    });
  });
});
