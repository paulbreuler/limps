/**
 * Tests for markdown utility functions.
 */

import { describe, it, expect } from 'vitest';
import { stripMarkdown } from '../../src/utils/markdown.js';

describe('stripMarkdown', () => {
  it('strips all markdown for clean display', () => {
    const input = '**Status:** Draft **Date:** 2026-01-15';
    const result = stripMarkdown(input);
    expect(result).toBe('Status: Draft Date: 2026-01-15');
    expect(result).not.toContain('**');
  });

  it('removes horizontal rules', () => {
    const input = 'Some text\n---\nMore text';
    const result = stripMarkdown(input);
    expect(result).not.toContain('---');
    expect(result).toContain('Some text');
    expect(result).toContain('More text');
  });

  it('strips bold and links to plain text', () => {
    const input = 'This is **bold** text with a [link](url)';
    const result = stripMarkdown(input);
    expect(result).toBe('This is bold text with a link');
    expect(result).not.toContain('**');
    expect(result).not.toContain('[');
  });

  it('strips headers but keeps text', () => {
    const input = '# Header\n## Subheader\nContent';
    const result = stripMarkdown(input);
    expect(result).toContain('Header');
    expect(result).toContain('Subheader');
    expect(result).toContain('Content');
    expect(result).not.toContain('#');
  });

  it('handles empty input', () => {
    expect(stripMarkdown('')).toBe('');
    expect(stripMarkdown('   ')).toBe('');
  });
});

describe('stripMarkdown', () => {
  it('removes all markdown syntax', () => {
    const input = '**bold** [link](url) `code`';
    const result = stripMarkdown(input);
    expect(result).toBe('bold link code');
  });

  it('removes headers but keeps text', () => {
    const input = '# Header\n## Subheader';
    const result = stripMarkdown(input);
    expect(result).toContain('Header');
    expect(result).toContain('Subheader');
    expect(result).not.toContain('#');
  });
});
