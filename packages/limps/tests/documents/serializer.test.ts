import { describe, it, expect } from 'vitest';
import { serializeDocument, serializeFrontmatter } from '../../src/documents/serializer.js';

describe('serializeFrontmatter', () => {
  it('should render YAML frontmatter block', () => {
    const fm = { type: 'persona', title: 'Alex Chen', status: 'active' };
    const result = serializeFrontmatter(fm);
    expect(result).toContain('---');
    expect(result).toContain('type: persona');
    expect(result).toContain('title: Alex Chen');
  });

  it('should handle arrays in frontmatter', () => {
    const fm = { tags: ['limps/persona', 'ux'] };
    const result = serializeFrontmatter(fm);
    expect(result).toContain('tags:');
    expect(result).toContain('- limps/persona');
  });

  it('should handle empty frontmatter', () => {
    const result = serializeFrontmatter({});
    expect(result).toBe('---\n{}\n---\n');
  });
});

describe('serializeDocument', () => {
  it('should combine frontmatter and body', () => {
    const fm = { type: 'persona', title: 'Test' };
    const body = '# Test\n\nContent here.';
    const result = serializeDocument(fm, body);
    expect(result.startsWith('---')).toBe(true);
    expect(result).toContain('# Test');
    expect(result).toContain('Content here.');
  });

  it('should have a blank line between frontmatter and body', () => {
    const fm = { type: 'agent' };
    const body = '# Agent';
    const result = serializeDocument(fm, body);
    // After the closing --- there should be \n\n before body
    expect(result).toContain('---\n\n# Agent');
  });
});
