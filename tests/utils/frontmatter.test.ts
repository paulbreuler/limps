/**
 * Tests for FrontmatterHandler class.
 */

import { describe, it, expect } from 'vitest';
import { FrontmatterHandler } from '../../src/utils/frontmatter.js';

describe('FrontmatterHandler', () => {
  const handler = new FrontmatterHandler();

  describe('parse', () => {
    it('parses YAML frontmatter correctly', () => {
      const content = `---
title: Test Document
tags:
  - project
  - important
status: WIP
---

# Content

Body text here.`;

      const result = handler.parse(content);

      expect(result.frontmatter).toEqual({
        title: 'Test Document',
        tags: ['project', 'important'],
        status: 'WIP',
      });
      expect(result.content.trim()).toBe('# Content\n\nBody text here.');
    });

    it('handles content without frontmatter', () => {
      const content = '# No Frontmatter\n\nJust content.';

      const result = handler.parse(content);

      expect(result.frontmatter).toEqual({});
      expect(result.content).toBe(content);
    });

    it('handles empty frontmatter', () => {
      const content = `---
---

# Content`;

      const result = handler.parse(content);

      expect(result.frontmatter).toEqual({});
      expect(result.content.trim()).toBe('# Content');
    });

    it('handles Obsidian properties format', () => {
      const content = `---
title: Obsidian Note
tags:
  - project/mobile
  - status/in-progress
aliases:
  - Mobile Project
created: 2024-01-15
---

# Note`;

      const result = handler.parse(content);

      expect(result.frontmatter.tags).toEqual(['project/mobile', 'status/in-progress']);
      expect(result.frontmatter.aliases).toEqual(['Mobile Project']);
    });
  });

  describe('stringify', () => {
    it('stringifies frontmatter and content', () => {
      const frontmatter = {
        title: 'Test',
        tags: ['a', 'b'],
      };
      const content = '# Body\n\nText.';

      const result = handler.stringify(frontmatter, content);

      expect(result).toContain('---');
      expect(result).toContain('title: Test');
      expect(result).toContain('# Body');
    });

    it('returns content as-is when no frontmatter', () => {
      const content = '# Body\n\nText.';

      const result = handler.stringify({}, content);

      expect(result).toBe(content);
    });
  });

  describe('validate', () => {
    it('validates safe frontmatter', () => {
      const frontmatter = {
        title: 'Test',
        count: 42,
        enabled: true,
        tags: ['a', 'b'],
      };

      const result = handler.validate(frontmatter);

      expect(result.isValid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects functions in frontmatter', () => {
      const frontmatter = {
        title: 'Test',
        dangerous: (): void => console.log('hack'),
      };

      const result = handler.validate(frontmatter);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // gray-matter catches this at YAML serialization time
      expect(result.errors[0]).toContain('Invalid YAML structure');
    });

    it('rejects symbols in frontmatter', () => {
      const frontmatter = {
        title: 'Test',
        symbol: Symbol('test'),
      };

      const result = handler.validate(frontmatter);

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      // gray-matter catches this at YAML serialization time
      expect(result.errors[0]).toContain('Invalid YAML structure');
    });

    it('validates nested objects', () => {
      const frontmatter = {
        metadata: {
          author: 'John',
          nested: {
            value: 123,
          },
        },
      };

      const result = handler.validate(frontmatter);

      expect(result.isValid).toBe(true);
    });

    it('rejects functions in nested objects', () => {
      const frontmatter = {
        metadata: {
          author: 'John',
          fn: (): void => {},
        },
      };

      const result = handler.validate(frontmatter);

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('metadata.fn'))).toBe(true);
    });
  });

  describe('extractFrontmatter', () => {
    it('extracts only frontmatter', () => {
      const content = `---
title: Test
status: WIP
---

# Body`;

      const result = handler.extractFrontmatter(content);

      expect(result).toEqual({
        title: 'Test',
        status: 'WIP',
      });
    });
  });

  describe('updateFrontmatter', () => {
    it('updates frontmatter while preserving content', () => {
      const content = `---
title: Old Title
status: GAP
---

# Body`;

      const result = handler.updateFrontmatter(content, {
        title: 'New Title',
        status: 'WIP',
      });

      const parsed = handler.parse(result);
      expect(parsed.frontmatter.title).toBe('New Title');
      expect(parsed.frontmatter.status).toBe('WIP');
      expect(parsed.content.trim()).toBe('# Body');
    });

    it('throws on invalid frontmatter', () => {
      const content = `---
title: Test
---

# Body`;

      expect(() => {
        handler.updateFrontmatter(content, {
          dangerous: () => {},
        } as unknown as Record<string, unknown>);
      }).toThrow();
    });
  });
});
