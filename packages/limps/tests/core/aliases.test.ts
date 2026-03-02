import { describe, it, expect } from 'vitest';
import { GROUP_ALIASES } from '../../src/core/aliases.js';

describe('GROUP_ALIASES', () => {
  it('should map all 8 abbreviations correctly', () => {
    expect(GROUP_ALIASES).toEqual({
      gn: 'gen',
      pl: 'plan',
      dc: 'docs',
      gr: 'graph',
      hl: 'health',
      sv: 'server',
      cf: 'config',
      pr: 'proposals',
    });
  });

  it('should have exactly 8 entries', () => {
    expect(Object.keys(GROUP_ALIASES)).toHaveLength(8);
  });

  describe('expandAlias (argv expansion logic)', () => {
    function expandAlias(argv: string[]): string[] {
      const [firstArg, ...rest] = argv;
      if (firstArg && GROUP_ALIASES[firstArg]) {
        return [GROUP_ALIASES[firstArg], ...rest];
      }
      return argv;
    }

    it('should expand "gn" to "gen"', () => {
      expect(expandAlias(['gn', 'persona', 'alice'])).toEqual(['gen', 'persona', 'alice']);
    });

    it('should expand "pl" to "plan"', () => {
      expect(expandAlias(['pl', 'list'])).toEqual(['plan', 'list']);
    });

    it('should expand "dc" to "docs"', () => {
      expect(expandAlias(['dc', 'search', 'query'])).toEqual(['docs', 'search', 'query']);
    });

    it('should expand "gr" to "graph"', () => {
      expect(expandAlias(['gr', 'reindex'])).toEqual(['graph', 'reindex']);
    });

    it('should expand "hl" to "health"', () => {
      expect(expandAlias(['hl', 'check'])).toEqual(['health', 'check']);
    });

    it('should expand "sv" to "server"', () => {
      expect(expandAlias(['sv', 'start'])).toEqual(['server', 'start']);
    });

    it('should expand "cf" to "config"', () => {
      expect(expandAlias(['cf', 'show'])).toEqual(['config', 'show']);
    });

    it('should expand "pr" to "proposals"', () => {
      expect(expandAlias(['pr', 'apply'])).toEqual(['proposals', 'apply']);
    });

    it('should pass through unknown commands unchanged', () => {
      expect(expandAlias(['version'])).toEqual(['version']);
    });

    it('should pass through full group names unchanged', () => {
      expect(expandAlias(['plan', 'list'])).toEqual(['plan', 'list']);
    });

    it('should handle empty argv', () => {
      expect(expandAlias([])).toEqual([]);
    });

    it('should only expand the first argument', () => {
      expect(expandAlias(['docs', 'pl'])).toEqual(['docs', 'pl']);
    });
  });
});
