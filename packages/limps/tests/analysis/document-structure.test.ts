/**
 * Tests for DocumentAnalyzer - markdown reference extraction.
 */

import { describe, it, expect } from 'vitest';
import { DocumentAnalyzer } from '../../src/analysis/document-structure.js';

describe('DocumentAnalyzer', () => {
  const analyzer = new DocumentAnalyzer();

  describe('markdown links', () => {
    it('should extract relative markdown links', () => {
      const content = 'See [the plan](./0001-plan.md) for details.';
      const result = analyzer.analyze(content, 'docs/readme.md');

      expect(result.references).toHaveLength(1);
      expect(result.references[0]?.type).toBe('markdown_link');
      expect(result.references[0]?.target).toBe('./0001-plan.md');
      expect(result.references[0]?.confidence).toBe(0.9);
      expect(result.references[0]?.line).toBe(1);
    });

    it('should skip external HTTP links', () => {
      const content = 'See [docs](https://example.com/docs) for info.';
      const result = analyzer.analyze(content, 'readme.md');

      expect(result.references).toHaveLength(0);
    });

    it('should skip anchor-only links', () => {
      const content = 'See [section](#heading) below.';
      const result = analyzer.analyze(content, 'readme.md');

      expect(result.references).toHaveLength(0);
    });

    it('should strip anchor fragments from targets', () => {
      const content = 'See [section](./plan.md#overview) for details.';
      const result = analyzer.analyze(content, 'readme.md');

      expect(result.references).toHaveLength(1);
      expect(result.references[0]?.target).toBe('./plan.md');
    });
  });

  describe('wikilinks', () => {
    it('should extract basic wikilinks', () => {
      const content = 'Related to [[0001-feature-auth]].';
      const result = analyzer.analyze(content, 'plan.md');

      expect(result.references).toHaveLength(1);
      expect(result.references[0]?.type).toBe('wikilink');
      expect(result.references[0]?.target).toBe('0001-feature-auth');
      expect(result.references[0]?.confidence).toBe(1.0);
    });

    it('should extract wikilinks with alias', () => {
      const content = 'See [[0001-feature-auth|auth feature]] for details.';
      const result = analyzer.analyze(content, 'plan.md');

      expect(result.references).toHaveLength(1);
      expect(result.references[0]?.target).toBe('0001-feature-auth');
    });
  });

  describe('code imports', () => {
    it('should extract relative import statements', () => {
      const content = "import { foo } from './utils/helper.js';";
      const result = analyzer.analyze(content, 'src/index.ts');

      expect(result.references).toHaveLength(1);
      expect(result.references[0]?.type).toBe('code_import');
      expect(result.references[0]?.target).toBe('./utils/helper.js');
      expect(result.references[0]?.confidence).toBe(1.0);
    });

    it('should extract require statements', () => {
      const content = "const path = require('./config');";
      const result = analyzer.analyze(content, 'src/index.js');

      expect(result.references).toHaveLength(1);
      expect(result.references[0]?.type).toBe('code_import');
      expect(result.references[0]?.target).toBe('./config');
    });

    it('should skip bare package imports', () => {
      const content = "import { z } from 'zod';";
      const result = analyzer.analyze(content, 'src/index.ts');

      // Should not include non-relative imports
      const codeImports = result.references.filter((r) => r.type === 'code_import');
      expect(codeImports).toHaveLength(0);
    });
  });

  describe('file mentions', () => {
    it('should extract backtick-wrapped file paths', () => {
      const content = 'Edit `src/config.ts` to change settings.';
      const result = analyzer.analyze(content, 'readme.md');

      expect(result.references).toHaveLength(1);
      expect(result.references[0]?.type).toBe('file_mention');
      expect(result.references[0]?.target).toBe('src/config.ts');
      expect(result.references[0]?.confidence).toBe(0.7);
    });

    it('should extract multiple file mentions on one line', () => {
      const content = 'Update `src/server.ts` and `src/config.json` for the change.';
      const result = analyzer.analyze(content, 'readme.md');

      expect(result.references).toHaveLength(2);
    });
  });

  describe('cross-repo detection', () => {
    it('should detect deeply nested relative paths as cross-repo', () => {
      const content = 'See [other](../../../other-repo/src/index.ts) for reference.';
      const result = analyzer.analyze(content, 'plan.md');

      expect(result.references).toHaveLength(1);
      expect(result.references[0]?.crossRepo).toBe(true);
    });

    it('should not flag normal relative paths as cross-repo', () => {
      const content = 'See [plan](../plans/0001-plan.md) for details.';
      const result = analyzer.analyze(content, 'docs/readme.md');

      expect(result.references).toHaveLength(1);
      expect(result.references[0]?.crossRepo).toBe(false);
    });
  });

  describe('counts', () => {
    it('should provide accurate counts by type', () => {
      const content = [
        'See [plan](./plan.md) and [[wiki-link]].',
        "Also `src/index.ts` and import { x } from './helper.js';",
      ].join('\n');
      const result = analyzer.analyze(content, 'readme.md');

      expect(result.counts.markdown_link).toBe(1);
      expect(result.counts.wikilink).toBe(1);
      expect(result.counts.file_mention).toBe(1);
      expect(result.counts.code_import).toBe(1);
    });
  });

  describe('line numbers', () => {
    it('should report correct line numbers', () => {
      const content = ['# Title', '', 'See [[target]] here.', '', 'And `src/file.ts` there.'].join(
        '\n'
      );
      const result = analyzer.analyze(content, 'readme.md');

      expect(result.references).toHaveLength(2);
      expect(result.references[0]?.line).toBe(3);
      expect(result.references[1]?.line).toBe(5);
    });
  });
});
