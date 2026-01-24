import { describe, it, expect } from 'vitest';
import {
  DocumentError,
  notFound,
  alreadyExists,
  permissionDenied,
  restrictedPath,
  validationError,
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
      it('returns PERMISSION_DENIED error with path and reason', () => {
        const error = permissionDenied('secret.md', 'Read-only file');

        expect(error.code).toBe('PERMISSION_DENIED');
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
});
