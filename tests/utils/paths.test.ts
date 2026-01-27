import { describe, it, expect } from 'vitest';
import { join } from 'path';
import {
  validatePath,
  isWritablePath,
  getDocType,
  RESTRICTED_PATHS,
  WRITABLE_DIRS,
  isProtectedPlanFile,
} from '../../src/utils/paths.js';

// Test with a mock repo root
const TEST_REPO_ROOT = '/test/repo';

describe('paths.ts', () => {
  describe('validatePath', () => {
    it('validates relative path within repo', () => {
      const result = validatePath('addendums/004-new-topic.md', TEST_REPO_ROOT);

      expect(result.relative).toBe('addendums/004-new-topic.md');
      expect(result.absolute).toBe(join(TEST_REPO_ROOT, 'addendums/004-new-topic.md'));
      expect(result.directory).toBe('addendums');
      expect(result.filename).toBe('004-new-topic.md');
      expect(result.extension).toBe('.md');
      expect(result.type).toBe('md');
    });

    it('validates root-level files', () => {
      const result = validatePath('VISION.md', TEST_REPO_ROOT);

      expect(result.relative).toBe('VISION.md');
      expect(result.absolute).toBe(join(TEST_REPO_ROOT, 'VISION.md'));
      expect(result.directory).toBe('');
      expect(result.filename).toBe('VISION.md');
    });

    it('normalizes paths with trailing slashes', () => {
      const result = validatePath('examples/', TEST_REPO_ROOT);

      expect(result.relative).toBe('examples');
      expect(result.directory).toBe('');
      expect(result.filename).toBe('examples');
    });

    it('normalizes paths with double slashes', () => {
      const result = validatePath('addendums//test.md', TEST_REPO_ROOT);

      expect(result.relative).toBe('addendums/test.md');
    });

    it('rejects path traversal with ../', () => {
      expect(() => validatePath('../../../etc/passwd', TEST_REPO_ROOT)).toThrow(
        'Path traversal not allowed'
      );
    });

    it('rejects path traversal embedded in path', () => {
      expect(() => validatePath('addendums/../../../etc/passwd', TEST_REPO_ROOT)).toThrow(
        'Path traversal not allowed'
      );
    });

    it('rejects absolute paths', () => {
      expect(() => validatePath('/etc/passwd', TEST_REPO_ROOT)).toThrow('Path must be relative');
    });

    it('rejects paths to .git directory', () => {
      expect(() => validatePath('.git/config', TEST_REPO_ROOT)).toThrow('restricted');
    });

    it('rejects paths to node_modules', () => {
      expect(() => validatePath('node_modules/package/index.js', TEST_REPO_ROOT)).toThrow(
        'restricted'
      );
    });

    it('rejects paths to .env files', () => {
      expect(() => validatePath('.env', TEST_REPO_ROOT)).toThrow('restricted');
      expect(() => validatePath('.env.local', TEST_REPO_ROOT)).toThrow('restricted');
    });

    it('allows empty path (repo root)', () => {
      const result = validatePath('', TEST_REPO_ROOT);

      expect(result.relative).toBe('');
      expect(result.absolute).toBe(TEST_REPO_ROOT);
    });
  });

  describe('isWritablePath', () => {
    it('returns true for addendums directory', () => {
      expect(isWritablePath('addendums/001-test.md')).toBe(true);
    });

    it('returns true for examples directory', () => {
      expect(isWritablePath('examples/component.jsx')).toBe(true);
    });

    it('returns true for research directory', () => {
      expect(isWritablePath('research/notes.md')).toBe(true);
    });

    it('returns true for root markdown files', () => {
      expect(isWritablePath('VISION.md')).toBe(true);
      expect(isWritablePath('README.md')).toBe(true);
    });

    it('returns true for plans directory', () => {
      expect(isWritablePath('plans/0001/plan.md')).toBe(true);
      expect(isWritablePath('plans/0001/README.md')).toBe(true);
      expect(isWritablePath('plans/0001/interfaces.md')).toBe(true);
      expect(isWritablePath('plans/0001/gotchas.md')).toBe(true);
      expect(isWritablePath('plans/0001/agents/test.agent.md')).toBe(true);
    });

    it('returns false for .cursor directory', () => {
      expect(isWritablePath('.cursor/settings.json')).toBe(false);
    });

    it('returns false for .claude directory', () => {
      expect(isWritablePath('.claude/commands/test.md')).toBe(false);
    });

    it('returns false for .git directory', () => {
      expect(isWritablePath('.git/config')).toBe(false);
    });

    it('returns false for non-md root files', () => {
      expect(isWritablePath('package.json')).toBe(false);
    });
  });

  describe('getDocType', () => {
    it('identifies markdown files', () => {
      expect(getDocType('test.md')).toBe('md');
      expect(getDocType('path/to/file.md')).toBe('md');
    });

    it('identifies JSX files', () => {
      expect(getDocType('component.jsx')).toBe('jsx');
    });

    it('identifies TSX files', () => {
      expect(getDocType('component.tsx')).toBe('tsx');
    });

    it('identifies TypeScript files', () => {
      expect(getDocType('module.ts')).toBe('ts');
    });

    it('identifies JSON files', () => {
      expect(getDocType('config.json')).toBe('json');
    });

    it('identifies YAML files', () => {
      expect(getDocType('config.yaml')).toBe('yaml');
      expect(getDocType('config.yml')).toBe('yaml');
    });

    it('returns other for unknown extensions', () => {
      expect(getDocType('binary.exe')).toBe('other');
      expect(getDocType('image.png')).toBe('other');
    });

    it('returns other for files without extension', () => {
      expect(getDocType('Makefile')).toBe('other');
    });
  });

  describe('RESTRICTED_PATHS', () => {
    it('includes .git', () => {
      expect(RESTRICTED_PATHS).toContain('.git');
    });

    it('includes node_modules', () => {
      expect(RESTRICTED_PATHS).toContain('node_modules');
    });

    it('includes .env patterns', () => {
      expect(RESTRICTED_PATHS.some((p) => p.includes('.env'))).toBe(true);
    });
  });

  describe('WRITABLE_DIRS', () => {
    it('includes addendums', () => {
      expect(WRITABLE_DIRS).toContain('addendums');
    });

    it('includes examples', () => {
      expect(WRITABLE_DIRS).toContain('examples');
    });

    it('includes research', () => {
      expect(WRITABLE_DIRS).toContain('research');
    });

    it('includes plans', () => {
      expect(WRITABLE_DIRS).toContain('plans');
    });
  });

  describe('isProtectedPlanFile', () => {
    it('identifies protected plan files (legacy format)', () => {
      expect(isProtectedPlanFile('plans/0001-test/plan.md')).toBe(true);
      expect(isProtectedPlanFile('plans/0012-release-pipeline/plan.md')).toBe(true);
    });

    it('identifies protected plan files (new format)', () => {
      expect(isProtectedPlanFile('plans/0001-test/0001-test-plan.md')).toBe(true);
      expect(isProtectedPlanFile('plans/0012-release-pipeline/0012-release-pipeline-plan.md')).toBe(
        true
      );
    });

    it('does not identify non-plan.md files as protected', () => {
      expect(isProtectedPlanFile('plans/0001-test/README.md')).toBe(false);
      expect(isProtectedPlanFile('plans/0001-test/interfaces.md')).toBe(false);
      expect(isProtectedPlanFile('plans/0001-test/gotchas.md')).toBe(false);
      expect(isProtectedPlanFile('plans/0001-test/agents/test.agent.md')).toBe(false);
    });

    it('does not identify files outside plans directory as protected', () => {
      expect(isProtectedPlanFile('addendums/001-test.md')).toBe(false);
      expect(isProtectedPlanFile('VISION.md')).toBe(false);
    });
  });
});
