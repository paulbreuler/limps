/**
 * Tests for JSON output utilities.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  wrapSuccess,
  wrapError,
  isJsonMode,
  type JsonSuccess,
  type JsonError,
  type JsonEnvelope,
} from '../src/cli/json-output.js';

describe('JSON Output', () => {
  describe('wrapSuccess', () => {
    it('wraps data in success envelope', () => {
      const data = { name: 'test', value: 42 };
      const result = wrapSuccess(data);

      expect(result).toEqual({
        success: true,
        data: { name: 'test', value: 42 },
      });
    });

    it('wraps array data', () => {
      const data = [1, 2, 3];
      const result = wrapSuccess(data);

      expect(result.success).toBe(true);
      expect(result.data).toEqual([1, 2, 3]);
    });

    it('wraps null data', () => {
      const result = wrapSuccess(null);

      expect(result).toEqual({
        success: true,
        data: null,
      });
    });

    it('wraps primitive data', () => {
      expect(wrapSuccess('string').data).toBe('string');
      expect(wrapSuccess(42).data).toBe(42);
      expect(wrapSuccess(true).data).toBe(true);
    });

    it('returns correct type', () => {
      const result: JsonSuccess<{ name: string }> = wrapSuccess({ name: 'test' });
      expect(result.success).toBe(true);
    });
  });

  describe('wrapError', () => {
    it('wraps error message in error envelope', () => {
      const result = wrapError('Something went wrong');

      expect(result).toEqual({
        success: false,
        error: 'Something went wrong',
      });
    });

    it('includes error code when provided', () => {
      const result = wrapError('Not found', { code: 'NOT_FOUND' });

      expect(result).toEqual({
        success: false,
        error: 'Not found',
        code: 'NOT_FOUND',
      });
    });

    it('includes suggestions when provided', () => {
      const result = wrapError('Plan not found', {
        suggestions: ['0001', '0002', '0003'],
      });

      expect(result).toEqual({
        success: false,
        error: 'Plan not found',
        suggestions: ['0001', '0002', '0003'],
      });
    });

    it('includes both code and suggestions', () => {
      const result = wrapError('Task not found', {
        code: 'TASK_NOT_FOUND',
        suggestions: ['Did you mean 0001#001?'],
      });

      expect(result).toEqual({
        success: false,
        error: 'Task not found',
        code: 'TASK_NOT_FOUND',
        suggestions: ['Did you mean 0001#001?'],
      });
    });

    it('omits suggestions when empty array', () => {
      const result = wrapError('Error', { suggestions: [] });

      expect(result).toEqual({
        success: false,
        error: 'Error',
      });
      expect('suggestions' in result).toBe(false);
    });

    it('omits code when undefined', () => {
      const result = wrapError('Error', { code: undefined });

      expect(result).toEqual({
        success: false,
        error: 'Error',
      });
      expect('code' in result).toBe(false);
    });

    it('returns correct type', () => {
      const result: JsonError = wrapError('test');
      expect(result.success).toBe(false);
    });
  });

  describe('isJsonMode', () => {
    it('returns true when json is true', () => {
      expect(isJsonMode({ json: true })).toBe(true);
    });

    it('returns false when json is false', () => {
      expect(isJsonMode({ json: false })).toBe(false);
    });

    it('returns false when json is undefined', () => {
      expect(isJsonMode({})).toBe(false);
      expect(isJsonMode({ json: undefined })).toBe(false);
    });

    it('returns false for other truthy values', () => {
      // Type safety should prevent this, but test defensive behavior
      expect(isJsonMode({ json: 1 as unknown as boolean })).toBe(false);
      expect(isJsonMode({ json: 'true' as unknown as boolean })).toBe(false);
    });
  });

  describe('JsonEnvelope type', () => {
    it('success envelope has success: true', () => {
      const envelope: JsonEnvelope<string> = wrapSuccess('data');
      if (envelope.success) {
        expect(envelope.data).toBe('data');
      }
    });

    it('error envelope has success: false', () => {
      const envelope: JsonEnvelope<string> = wrapError('error');
      if (!envelope.success) {
        expect(envelope.error).toBe('error');
      }
    });

    it('discriminates correctly', () => {
      const success: JsonEnvelope<number> = wrapSuccess(42);
      const error: JsonEnvelope<number> = wrapError('fail');

      expect(success.success).toBe(true);
      expect(error.success).toBe(false);
    });
  });
});

describe('outputJson', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockProcessExit.mockRestore();
  });

  it('outputs formatted JSON to stdout', async () => {
    const { outputJson } = await import('../src/cli/json-output.js');

    try {
      outputJson(wrapSuccess({ test: 'data' }));
    } catch {
      // Expected to throw due to mocked process.exit
    }

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify({ success: true, data: { test: 'data' } }, null, 2)
    );
  });

  it('exits with 0 for success envelope', async () => {
    const { outputJson } = await import('../src/cli/json-output.js');

    try {
      outputJson(wrapSuccess('data'));
    } catch {
      // Expected
    }

    expect(mockProcessExit).toHaveBeenCalledWith(0);
  });

  it('exits with 1 for error envelope', async () => {
    const { outputJson } = await import('../src/cli/json-output.js');

    try {
      outputJson(wrapError('error'));
    } catch {
      // Expected
    }

    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('uses custom exit code when provided', async () => {
    const { outputJson } = await import('../src/cli/json-output.js');

    try {
      outputJson(wrapSuccess('data'), 2);
    } catch {
      // Expected
    }

    expect(mockProcessExit).toHaveBeenCalledWith(2);
  });
});

describe('handleJsonOutput', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;
  let mockProcessExit: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockProcessExit = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called');
    });
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
    mockProcessExit.mockRestore();
  });

  it('outputs success when getData succeeds', async () => {
    const { handleJsonOutput } = await import('../src/cli/json-output.js');

    try {
      handleJsonOutput(() => ({ result: 'success' }));
    } catch {
      // Expected
    }

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify({ success: true, data: { result: 'success' } }, null, 2)
    );
    expect(mockProcessExit).toHaveBeenCalledWith(0);
  });

  it('outputs error when getData throws', async () => {
    const { handleJsonOutput } = await import('../src/cli/json-output.js');

    try {
      handleJsonOutput(() => {
        throw new Error('Something failed');
      });
    } catch {
      // Expected
    }

    expect(mockConsoleLog).toHaveBeenCalledWith(
      JSON.stringify({ success: false, error: 'Something failed' }, null, 2)
    );
    expect(mockProcessExit).toHaveBeenCalledWith(1);
  });

  it('includes error code when provided', async () => {
    const { handleJsonOutput } = await import('../src/cli/json-output.js');

    try {
      handleJsonOutput(() => {
        throw new Error('Not found');
      }, 'NOT_FOUND');
    } catch {
      // Expected
    }

    const output = JSON.parse(mockConsoleLog.mock.calls[0][0] as string);
    expect(output.code).toBe('NOT_FOUND');
  });

  it('includes suggestions from error', async () => {
    const { handleJsonOutput } = await import('../src/cli/json-output.js');

    const errorWithSuggestions = new Error('Plan not found') as Error & {
      suggestions?: string[];
    };
    errorWithSuggestions.suggestions = ['0001', '0002'];

    try {
      handleJsonOutput(() => {
        throw errorWithSuggestions;
      });
    } catch {
      // Expected
    }

    const output = JSON.parse(mockConsoleLog.mock.calls[0][0] as string);
    expect(output.suggestions).toEqual(['0001', '0002']);
  });
});
