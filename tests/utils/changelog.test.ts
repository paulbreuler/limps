import { describe, it, expect } from 'vitest';
import { getChangelogForVersion, formatChangelogForDisplay } from '../../src/utils/changelog.js';

describe('changelog.ts', () => {
  // We'll test with the actual CHANGELOG.md file since it exists
  // and the function reads from the project root

  describe('getChangelogForVersion', () => {
    it('returns changelog entry for existing version', () => {
      const changelog = getChangelogForVersion('1.1.1');
      expect(changelog).toBeTruthy();
      expect(changelog).toContain('1.1.1');
    });

    it('returns null for non-existent version', () => {
      const changelog = getChangelogForVersion('999.999.999');
      expect(changelog).toBeNull();
    });

    it('handles version with brackets', () => {
      const changelog = getChangelogForVersion('[1.1.1]');
      expect(changelog).toBeTruthy();
    });

    it('handles version with v prefix', () => {
      const changelog = getChangelogForVersion('v1.1.1');
      expect(changelog).toBeTruthy();
    });

    it('extracts content until next version', () => {
      const changelog = getChangelogForVersion('1.1.0');
      expect(changelog).toBeTruthy();
      // Should not contain content from 1.1.1
      if (changelog) {
        expect(changelog).not.toContain('1.1.1');
      }
    });

    it('includes version header in result', () => {
      const changelog = getChangelogForVersion('1.1.1');
      if (changelog) {
        expect(changelog).toMatch(/##\s*\[?1\.1\.1\]?/);
      }
    });
  });

  describe('formatChangelogForDisplay', () => {
    it('removes markdown links', () => {
      const input = 'See [this link](https://example.com) for more info';
      const output = formatChangelogForDisplay(input);
      expect(output).toBe('See this link for more info');
      expect(output).not.toContain('[');
      expect(output).not.toContain(']');
      expect(output).not.toContain('(');
      expect(output).not.toContain(')');
    });

    it('preserves other markdown formatting', () => {
      const input = '### Features\n\n* Item one\n* Item two';
      const output = formatChangelogForDisplay(input);
      expect(output).toContain('### Features');
      expect(output).toContain('* Item one');
      expect(output).toContain('* Item two');
    });

    it('handles multiple links', () => {
      const input = 'See [link1](url1) and [link2](url2) for details';
      const output = formatChangelogForDisplay(input);
      expect(output).toBe('See link1 and link2 for details');
    });

    it('handles empty input', () => {
      const output = formatChangelogForDisplay('');
      expect(output).toBe('');
    });

    it('preserves line breaks', () => {
      const input = 'Line 1\n\nLine 2';
      const output = formatChangelogForDisplay(input);
      expect(output).toBe('Line 1\n\nLine 2');
    });
  });
});
