import { describe, it, expect } from 'vitest';
import {
  validateConfig,
  getAllDocsPaths,
  getFileExtensions,
  getRetrievalConfig,
  type ServerConfig,
} from '../src/config.js';

describe('config-validation', () => {
  it('should validate correct configuration', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      dataPath: '/path/to/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
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
    expect(
      validateConfig({
        plansPath: '/path',
        dataPath: '/path',
      } as unknown as ServerConfig)
    ).toBe(false);
  });

  it('should validate config with optional docsPaths', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      docsPaths: ['/path/to/docs', '/path/to/more'],
      dataPath: '/path/to/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    expect(validateConfig(config)).toBe(true);
  });

  it('should validate config with optional fileExtensions', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      fileExtensions: ['.md', '.jsx', '.tsx'],
      dataPath: '/path/to/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    expect(validateConfig(config)).toBe(true);
  });

  it('should validate config with tool filtering', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      dataPath: '/path/to/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
      tools: {
        allowlist: ['list_docs', 'search_docs'],
        denylist: ['process_doc'],
      },
    };

    expect(validateConfig(config)).toBe(true);
  });

  it('should reject invalid docsPaths (not array)', () => {
    expect(
      validateConfig({
        plansPath: '/path',
        docsPaths: 'not-an-array',
        dataPath: '/path',
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {},
        },
      })
    ).toBe(false);
  });

  it('should reject invalid fileExtensions (not array)', () => {
    expect(
      validateConfig({
        plansPath: '/path',
        fileExtensions: '.md',
        dataPath: '/path',
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {},
        },
      })
    ).toBe(false);
  });

  it('should reject docsPaths with non-string elements', () => {
    expect(
      validateConfig({
        plansPath: '/path',
        docsPaths: ['/valid', 123, '/also-valid'],
        dataPath: '/path',
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {},
        },
      })
    ).toBe(false);
  });

  it('should validate config with optional health.staleness', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      dataPath: '/path/to/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
      health: {
        staleness: {
          warningDays: 7,
          criticalDays: 21,
          excludeStatuses: ['PASS', 'BLOCKED'],
        },
      },
    };

    expect(validateConfig(config)).toBe(true);
  });

  it('should reject invalid health.staleness (non-numeric day field)', () => {
    expect(
      validateConfig({
        plansPath: '/path',
        dataPath: '/path',
        scoring: {
          weights: { dependency: 40, priority: 30, workload: 30 },
          biases: {},
        },
        health: {
          staleness: {
            warningDays: 'seven',
          },
        },
      } as unknown as ServerConfig)
    ).toBe(false);
  });

  it('should reject invalid health.staleness (excludeStatuses not array of strings)', () => {
    expect(
      validateConfig({
        plansPath: '/path',
        dataPath: '/path',
        scoring: {
          weights: { dependency: 40, priority: 30, workload: 30 },
          biases: {},
        },
        health: {
          staleness: {
            excludeStatuses: ['PASS', 123],
          },
        },
      } as unknown as ServerConfig)
    ).toBe(false);
  });

  it('should reject invalid tools allowlist/denylist types', () => {
    expect(
      validateConfig({
        plansPath: '/path',
        dataPath: '/path',
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {},
        },
        tools: {
          allowlist: 'list_docs',
        },
      } as unknown as ServerConfig)
    ).toBe(false);

    expect(
      validateConfig({
        plansPath: '/path',
        dataPath: '/path',
        scoring: {
          weights: {
            dependency: 40,
            priority: 30,
            workload: 30,
          },
          biases: {},
        },
        tools: {
          denylist: [123],
        },
      } as unknown as ServerConfig)
    ).toBe(false);
  });
});

describe('retrieval config validation', () => {
  const baseConfig = {
    plansPath: '/path',
    dataPath: '/path',
    scoring: {
      weights: { dependency: 40, priority: 30, workload: 30 },
      biases: {},
    },
  };

  it('should validate config with valid retrieval section', () => {
    expect(
      validateConfig({
        ...baseConfig,
        retrieval: {
          defaultRecipe: 'HYBRID_BALANCED',
          graphConfig: { maxDepth: 2, hopDecay: 0.5 },
          similarityThreshold: 0.7,
        },
      })
    ).toBe(true);
  });

  it('should validate config without retrieval section', () => {
    expect(validateConfig(baseConfig)).toBe(true);
  });

  it('should reject retrieval with non-string defaultRecipe', () => {
    expect(
      validateConfig({
        ...baseConfig,
        retrieval: { defaultRecipe: 123 },
      } as unknown as ServerConfig)
    ).toBe(false);
  });

  it('should reject retrieval with out-of-range similarityThreshold', () => {
    expect(
      validateConfig({
        ...baseConfig,
        retrieval: { similarityThreshold: 1.5 },
      } as unknown as ServerConfig)
    ).toBe(false);

    expect(
      validateConfig({
        ...baseConfig,
        retrieval: { similarityThreshold: -0.1 },
      } as unknown as ServerConfig)
    ).toBe(false);
  });

  it('should reject retrieval with non-numeric graphConfig fields', () => {
    expect(
      validateConfig({
        ...baseConfig,
        retrieval: { graphConfig: { maxDepth: 'two' } },
      } as unknown as ServerConfig)
    ).toBe(false);
  });

  it('should reject non-object retrieval', () => {
    expect(
      validateConfig({
        ...baseConfig,
        retrieval: 'invalid',
      } as unknown as ServerConfig)
    ).toBe(false);
  });
});

describe('getRetrievalConfig', () => {
  it('should return empty config when no retrieval section', () => {
    const config: ServerConfig = {
      plansPath: '/path',
      dataPath: '/path',
      scoring: {
        weights: { dependency: 40, priority: 30, workload: 30 },
        biases: {},
      },
    };
    const retrieval = getRetrievalConfig(config);
    expect(retrieval).toEqual({});
  });

  it('should return configured retrieval values', () => {
    const config: ServerConfig = {
      plansPath: '/path',
      dataPath: '/path',
      scoring: {
        weights: { dependency: 40, priority: 30, workload: 30 },
        biases: {},
      },
      retrieval: {
        defaultRecipe: 'LEXICAL_FIRST',
        similarityThreshold: 0.8,
      },
    };
    const retrieval = getRetrievalConfig(config);
    expect(retrieval.defaultRecipe).toBe('LEXICAL_FIRST');
    expect(retrieval.similarityThreshold).toBe(0.8);
  });
});

describe('getAllDocsPaths', () => {
  it('should return plansPath when no docsPaths specified', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      dataPath: '/path/to/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    const paths = getAllDocsPaths(config);
    expect(paths).toEqual(['/path/to/plans']);
  });

  it('should combine plansPath with docsPaths', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      docsPaths: ['/path/to/docs', '/path/to/more'],
      dataPath: '/path/to/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
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
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
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
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    const extensions = getFileExtensions(config);
    expect(extensions).toEqual(['.md']);
  });

  it('should return configured fileExtensions', () => {
    const config: ServerConfig = {
      plansPath: '/path/to/plans',
      fileExtensions: ['.md', '.jsx', '.tsx'],
      dataPath: '/path/to/data',
      scoring: {
        weights: {
          dependency: 40,
          priority: 30,
          workload: 30,
        },
        biases: {},
      },
    };

    const extensions = getFileExtensions(config);
    expect(extensions).toEqual(['.md', '.jsx', '.tsx']);
  });
});
