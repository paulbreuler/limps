import { describe, it, expect } from 'vitest';
import { getDocsRoot, getListingRoot } from '../../src/utils/repo-root.js';

describe('repo-root', () => {
  describe('getDocsRoot', () => {
    it('returns docsPaths[0] when docsPaths is configured', () => {
      const config = {
        plansPath: '/project/plans',
        docsPaths: ['/project', '/other'],
      };

      expect(getDocsRoot(config)).toBe('/project');
    });

    it('falls back to dirname(plansPath) when docsPaths is empty', () => {
      const config = {
        plansPath: '/project/plans',
        docsPaths: [],
      };

      expect(getDocsRoot(config)).toBe('/project');
    });

    it('falls back to dirname(plansPath) when docsPaths is undefined', () => {
      const config = {
        plansPath: '/project/plans',
        docsPaths: undefined,
      };

      expect(getDocsRoot(config)).toBe('/project');
    });
  });

  describe('getListingRoot', () => {
    it('returns docsPaths[0] when docsPaths is configured', () => {
      const config = {
        plansPath: '/project/plans',
        docsPaths: ['/project', '/other'],
      };

      expect(getListingRoot(config)).toBe('/project');
    });

    it('falls back to plansPath when docsPaths is empty', () => {
      const config = {
        plansPath: '/project/plans',
        docsPaths: [],
      };

      expect(getListingRoot(config)).toBe('/project/plans');
    });

    it('falls back to plansPath when docsPaths is undefined', () => {
      const config = {
        plansPath: '/project/plans',
        docsPaths: undefined,
      };

      expect(getListingRoot(config)).toBe('/project/plans');
    });
  });

  describe('getDocsRoot vs getListingRoot', () => {
    it('differ when docsPaths is not configured', () => {
      const config = {
        plansPath: '/project/plans',
        docsPaths: undefined,
      };

      // CRUD root = dirname(plansPath) = /project (preserves plans/ prefix)
      expect(getDocsRoot(config)).toBe('/project');
      // Listing root = plansPath = /project/plans (scoped to prevent fd exhaustion)
      expect(getListingRoot(config)).toBe('/project/plans');
    });

    it('agree when docsPaths is configured', () => {
      const config = {
        plansPath: '/project/plans',
        docsPaths: ['/project'],
      };

      expect(getDocsRoot(config)).toBe(getListingRoot(config));
    });
  });
});
