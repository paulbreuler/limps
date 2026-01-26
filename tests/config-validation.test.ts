import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  getAllDocsPaths,
  getFileExtensions,
  type ServerConfig,
} from '../src/config.js';

describe('config-validation', () => {
  it('should validate correct configuration', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      dataPath: '/path/to/data',
    };

    expect(validateConfig(config)).toBe(true);
  });

  it('should reject invalid configuration types', () => {
    expect(validateConfig(null)).toBe(false);
    expect(validateConfig(undefined)).toBe(false);
    expect(validateConfig('string')).toBe(false);
    expect(validateConfig(123)).toBe(false);
    expect(validateConfig({})).toBe(false);
  });

  it('should reject missing required fields', () => {
    expect(validateConfig({ plansPath: '/path' } as unknown as ServerConfig)).toBe(false);
    expect(validateConfig({ dataPath: '/path' } as unknown as ServerConfig)).toBe(false);
  });

  it('should validate config with optional docsPaths', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      docsPaths: ['/path/to/docs', '/path/to/more'],
      dataPath: '/path/to/data',
    };

    expect(validateConfig(config)).toBe(true);
  });

  it('should validate config with optional fileExtensions', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      fileExtensions: ['.md', '.jsx', '.tsx'],
      dataPath: '/path/to/data',
    };

    expect(validateConfig(config)).toBe(true);
  });

  it('should reject invalid docsPaths (not array)', () => {
    expect(
      validateConfig({
        plansPath: '/path',
        docsPaths: 'not-an-array',
        dataPath: '/path',
      })
    ).toBe(false);
  });

  it('should reject invalid fileExtensions (not array)', () => {
    expect(
      validateConfig({
        plansPath: '/path',
        fileExtensions: '.md',
        dataPath: '/path',
      })
    ).toBe(false);
  });

  it('should reject docsPaths with non-string elements', () => {
    expect(
      validateConfig({
        plansPath: '/path',
        docsPaths: ['/valid', 123, '/also-valid'],
        dataPath: '/path',
      })
    ).toBe(false);
  });
});

describe('getAllDocsPaths', () => {
  it('should return plansPath when no docsPaths specified', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      dataPath: '/path/to/data',
    };

    const paths = getAllDocsPaths(config);
    expect(paths).toEqual(['/path/to/plans']);
  });

  it('should combine plansPath with docsPaths', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      docsPaths: ['/path/to/docs', '/path/to/more'],
      dataPath: '/path/to/data',
    };

    const paths = getAllDocsPaths(config);
    expect(paths).toContain('/path/to/plans');
    expect(paths).toContain('/path/to/docs');
    expect(paths).toContain('/path/to/more');
    expect(paths.length).toBe(3);
  });

  it('should deduplicate paths', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      docsPaths: ['/path/to/plans', '/path/to/docs'], // plansPath is duplicated
      dataPath: '/path/to/data',
    };

    const paths = getAllDocsPaths(config);
    expect(paths.filter((p) => p === '/path/to/plans').length).toBe(1);
    expect(paths.length).toBe(2);
  });
});

describe('getFileExtensions', () => {
  it('should return default [.md] when no fileExtensions specified', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      dataPath: '/path/to/data',
    };

    const extensions = getFileExtensions(config);
    expect(extensions).toEqual(['.md']);
  });

  it('should return configured fileExtensions', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      fileExtensions: ['.md', '.jsx', '.tsx'],
      dataPath: '/path/to/data',
    };

    const extensions = getFileExtensions(config);
    expect(extensions).toEqual(['.md', '.jsx', '.tsx']);
  });
});
