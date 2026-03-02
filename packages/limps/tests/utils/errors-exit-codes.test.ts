import { describe, it, expect } from 'vitest';
import {
  exitCodeForError,
  EXIT_SUCCESS,
  EXIT_VALIDATION,
  EXIT_SYSTEM,
  DocumentError,
  LimpsError,
} from '../../src/utils/errors.js';

describe('exit code constants', () => {
  it('should have correct values', () => {
    expect(EXIT_SUCCESS).toBe(0);
    expect(EXIT_VALIDATION).toBe(1);
    expect(EXIT_SYSTEM).toBe(2);
  });
});

describe('exitCodeForError', () => {
  it('should return EXIT_VALIDATION for NOT_FOUND DocumentError', () => {
    const err = new DocumentError('NOT_FOUND', 'File not found');
    expect(exitCodeForError(err)).toBe(EXIT_VALIDATION);
  });

  it('should return EXIT_VALIDATION for ALREADY_EXISTS DocumentError', () => {
    const err = new DocumentError('ALREADY_EXISTS', 'Already exists');
    expect(exitCodeForError(err)).toBe(EXIT_VALIDATION);
  });

  it('should return EXIT_VALIDATION for VALIDATION_ERROR DocumentError', () => {
    const err = new DocumentError('VALIDATION_ERROR', 'Validation failed');
    expect(exitCodeForError(err)).toBe(EXIT_VALIDATION);
  });

  it('should return EXIT_SYSTEM for EACCES DocumentError', () => {
    const err = new DocumentError('EACCES', 'Permission denied');
    expect(exitCodeForError(err)).toBe(EXIT_SYSTEM);
  });

  it('should return EXIT_SYSTEM for ENOSPC DocumentError', () => {
    const err = new DocumentError('ENOSPC', 'No space left');
    expect(exitCodeForError(err)).toBe(EXIT_SYSTEM);
  });

  it('should return EXIT_VALIDATION for PLAN_NOT_FOUND LimpsError', () => {
    const err = new LimpsError('Plan not found', { code: 'PLAN_NOT_FOUND' });
    expect(exitCodeForError(err)).toBe(EXIT_VALIDATION);
  });

  it('should return EXIT_VALIDATION for TASK_NOT_FOUND LimpsError', () => {
    const err = new LimpsError('Task not found', { code: 'TASK_NOT_FOUND' });
    expect(exitCodeForError(err)).toBe(EXIT_VALIDATION);
  });

  it('should return EXIT_SYSTEM for unknown errors', () => {
    expect(exitCodeForError(new Error('Something broke'))).toBe(EXIT_SYSTEM);
  });

  it('should return EXIT_SYSTEM for non-Error throws', () => {
    expect(exitCodeForError('string error')).toBe(EXIT_SYSTEM);
  });
});
