import { describe, it, expect } from 'vitest';
import {
  DocumentError,
  notFound,
  alreadyExists,
  permissionDenied,
  restrictedPath,
  validationError,
  LimpsError,
  taskNotFoundError,
  planNotFoundError,
  type ErrorCode,
} from '../../src/utils/errors.js';

describe('errors.ts', () => {
  describe('DocumentError', () => {
    it('has code and message', () => {
      const error = new DocumentError('NOT_FOUND', 'File not found');

      expect(error.code).toBe('NOT_FOUND');
      expect(error.message).toBe('File not found');
      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('DocumentError');
    });

    it('accepts optional path and suggestion', () => {
      const error = new DocumentError(
        'NOT_FOUND',
        'File not found',
        'some/path.md',
        'Check the file exists'
      );

      expect(error.path).toBe('some/path.md');
      expect(error.suggestion).toBe('Check the file exists');
    });

    it('captures stack trace', () => {
      const error = new DocumentError('NOT_FOUND', 'test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('DocumentError');
    });
  });

  describe('toJSON', () => {
    it('returns MCPError shape with required fields', () => {
      const error = new DocumentError('NOT_FOUND', 'File not found');
      const json = error.toJSON();

      expect(json).toEqual({
        code: 'NOT_FOUND',
        message: 'File not found',
      });
    });

    it('includes path when provided', () => {
      const error = new DocumentError('NOT_FOUND', 'File not found', 'test.md');
      const json = error.toJSON();

      expect(json).toEqual({
        code: 'NOT_FOUND',
        message: 'File not found',
        path: 'test.md',
      });
    });

    it('includes suggestion when provided', () => {
      const error = new DocumentError('NOT_FOUND', 'File not found', 'test.md', 'Check path');
      const json = error.toJSON();

      expect(json).toEqual({
        code: 'NOT_FOUND',
        message: 'File not found',
        path: 'test.md',
        suggestion: 'Check path',
      });
    });
  });

  describe('factory functions', () => {
    describe('notFound', () => {
      it('returns NOT_FOUND error with path and suggestion', () => {
        const error = notFound('missing.md');

        expect(error.code).toBe('NOT_FOUND');
        expect(error.path).toBe('missing.md');
        expect(error.message).toContain('missing.md');
        expect(error.suggestion).toBeDefined();
        expect(error.suggestion).toContain('create_doc');
      });
    });

    describe('alreadyExists', () => {
      it('returns ALREADY_EXISTS error with path and suggestion', () => {
        const error = alreadyExists('existing.md');

        expect(error.code).toBe('ALREADY_EXISTS');
        expect(error.path).toBe('existing.md');
        expect(error.message).toContain('existing.md');
        expect(error.suggestion).toBeDefined();
        expect(error.suggestion).toContain('update_doc');
      });
    });

    describe('permissionDenied', () => {
      it('returns EACCES error with path and reason', () => {
        const error = permissionDenied('secret.md', 'Read-only file');

        expect(error.code).toBe('EACCES');
        expect(error.path).toBe('secret.md');
        expect(error.message).toContain('Read-only file');
      });
    });

    describe('restrictedPath', () => {
      it('returns RESTRICTED_PATH error listing allowed directories', () => {
        const error = restrictedPath('.git/config');

        expect(error.code).toBe('RESTRICTED_PATH');
        expect(error.path).toBe('.git/config');
        expect(error.suggestion).toBeDefined();
        // Should mention writable directories
        expect(error.suggestion).toMatch(/addendums|examples|research/i);
      });
    });

    describe('validationError', () => {
      it('returns VALIDATION_ERROR with field and message', () => {
        const error = validationError('path', 'must be relative');

        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.message).toContain('path');
        expect(error.message).toContain('must be relative');
      });
    });
  });

  describe('ErrorCode type', () => {
    it('accepts all valid error codes', () => {
      const codes: ErrorCode[] = [
        'NOT_FOUND',
        'ALREADY_EXISTS',
        'PERMISSION_DENIED',
        'VALIDATION_ERROR',
        'RESTRICTED_PATH',
        'INTERNAL_ERROR',
      ];

      codes.forEach((code) => {
        const error = new DocumentError(code, 'test');
        expect(error.code).toBe(code);
      });
    });
  });

  describe('LimpsError', () => {
    it('extends Error with code and suggestions', () => {
      const error = new LimpsError('Something went wrong', {
        code: 'TEST_ERROR',
        suggestions: ['Try this', 'Or that'],
      });

      expect(error).toBeInstanceOf(Error);
      expect(error.name).toBe('LimpsError');
      expect(error.message).toBe('Something went wrong');
      expect(error.code).toBe('TEST_ERROR');
      expect(error.suggestions).toEqual(['Try this', 'Or that']);
    });

    it('has default code and empty suggestions', () => {
      const error = new LimpsError('Error message');

      expect(error.code).toBe('UNKNOWN_ERROR');
      expect(error.suggestions).toEqual([]);
    });

    it('supports cause option for error chaining', () => {
      const cause = new Error('Original error');
      const error = new LimpsError('Wrapped error', { cause });

      expect(error.cause).toBe(cause);
    });

    it('captures stack trace', () => {
      const error = new LimpsError('test');
      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('LimpsError');
    });

    describe('toJson', () => {
      it('returns JsonError shape with message', () => {
        const error = new LimpsError('Test error');
        const json = error.toJson();

        expect(json).toEqual({
          success: false,
          error: 'Test error',
        });
      });

      it('includes code when not UNKNOWN_ERROR', () => {
        const error = new LimpsError('Test error', { code: 'TEST_CODE' });
        const json = error.toJson();

        expect(json).toEqual({
          success: false,
          error: 'Test error',
          code: 'TEST_CODE',
        });
      });

      it('includes suggestions when present', () => {
        const error = new LimpsError('Test error', {
          code: 'TEST_CODE',
          suggestions: ['Try this'],
        });
        const json = error.toJson();

        expect(json).toEqual({
          success: false,
          error: 'Test error',
          code: 'TEST_CODE',
          suggestions: ['Try this'],
        });
      });
    });
  });

  describe('taskNotFoundError', () => {
    it('creates error with TASK_NOT_FOUND code', () => {
      const error = taskNotFoundError('0001#999', []);

      expect(error.code).toBe('TASK_NOT_FOUND');
      expect(error.message).toContain('0001#999');
    });

    it('includes did-you-mean suggestions for similar agents', () => {
      const error = taskNotFoundError('0001#001', ['0001#000', '0001#010', '0001#002']);

      expect(error.suggestions.some((s) => s.includes('Did you mean'))).toBe(true);
    });

    it('lists available agents when few', () => {
      const error = taskNotFoundError('0001#999', ['0001#000', '0001#001']);

      expect(error.suggestions.some((s) => s.includes('Available agents'))).toBe(true);
      expect(error.suggestions.some((s) => s.includes('0001#000'))).toBe(true);
    });

    it('truncates list when many agents', () => {
      const agents = Array.from({ length: 10 }, (_, i) => `0001#00${i}`);
      const error = taskNotFoundError('0001#999', agents);

      expect(error.suggestions.some((s) => s.includes('and 5 more'))).toBe(true);
    });
  });

  describe('planNotFoundError', () => {
    it('creates error with PLAN_NOT_FOUND code', () => {
      const error = planNotFoundError('99', []);

      expect(error.code).toBe('PLAN_NOT_FOUND');
      expect(error.message).toContain('99');
    });

    it('includes did-you-mean suggestions for similar plans', () => {
      const error = planNotFoundError('0001-netwrk', ['0001-network', '0002-auth']);

      expect(error.suggestions.some((s) => s.includes('Did you mean'))).toBe(true);
      expect(error.suggestions.some((s) => s.includes('0001-network'))).toBe(true);
    });

    it('lists available plans when few', () => {
      const error = planNotFoundError('99', ['0001-network', '0002-auth']);

      expect(error.suggestions.some((s) => s.includes('Available plans'))).toBe(true);
    });
  });
});
