/**
 * Tests for the differ tools.
 */

import { describe, it, expect } from 'vitest';
import { diffVersionsInputSchema, checkUpdatesInputSchema } from '../src/tools/index.js';

describe('diffVersionsInputSchema', () => {
  it('requires fromVersion', () => {
    const result = diffVersionsInputSchema.safeParse({});
    expect(result.success).toBe(false);
  });

  it('accepts valid input', () => {
    const result = diffVersionsInputSchema.safeParse({
      fromVersion: '1.0.0',
    });
    expect(result.success).toBe(true);
    expect(result.data?.fromVersion).toBe('1.0.0');
    expect(result.data?.toVersion).toBe('latest');
    expect(result.data?.breakingOnly).toBe(false);
  });

  it('accepts all options', () => {
    const result = diffVersionsInputSchema.safeParse({
      fromVersion: '1.0.0',
      toVersion: '2.0.0',
      primitives: ['dialog', 'popover'],
      breakingOnly: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.toVersion).toBe('2.0.0');
    expect(result.data?.primitives).toEqual(['dialog', 'popover']);
    expect(result.data?.breakingOnly).toBe(true);
  });
});

describe('checkUpdatesInputSchema', () => {
  it('accepts empty input', () => {
    const result = checkUpdatesInputSchema.safeParse({});
    expect(result.success).toBe(true);
    expect(result.data?.refreshCache).toBe(false);
  });

  it('accepts refreshCache option', () => {
    const result = checkUpdatesInputSchema.safeParse({
      refreshCache: true,
    });
    expect(result.success).toBe(true);
    expect(result.data?.refreshCache).toBe(true);
  });

  it('accepts primitives option', () => {
    const result = checkUpdatesInputSchema.safeParse({
      primitives: ['dialog', 'tooltip'],
    });
    expect(result.success).toBe(true);
    expect(result.data?.primitives).toEqual(['dialog', 'tooltip']);
  });
});
