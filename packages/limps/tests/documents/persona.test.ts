import { describe, it, expect } from 'vitest';
import { Persona } from '../../src/documents/persona.js';

describe('Persona', () => {
  it('should create with correct type and title', () => {
    const p = new Persona('Alex Chen', 'A senior engineer');
    expect(p.type).toBe('persona');
    expect(p.title).toBe('Alex Chen');
    expect(p.description).toBe('A senior engineer');
    expect(p.id).toHaveLength(8);
  });

  it('should generate stable id from title', () => {
    const p1 = new Persona('Alex Chen', 'desc1');
    const p2 = new Persona('Alex Chen', 'desc2');
    expect(p1.id).toBe(p2.id);
  });

  it('should produce valid frontmatter', () => {
    const p = new Persona('Alex Chen', 'A senior engineer', '2026-01-01');
    const fm = p.frontmatter();
    expect(fm.type).toBe('persona');
    expect(fm.title).toBe('Alex Chen');
    expect(fm.tags).toContain('limps/persona');
  });

  it('should produce sections map', () => {
    const p = new Persona('Test', 'Desc');
    const sections = p.sections();
    expect(sections.has('Overview')).toBe(true);
    expect(sections.has('Goals')).toBe(true);
    expect(sections.has('Pain Points')).toBe(true);
  });

  it('should render valid markdown with frontmatter', () => {
    const p = new Persona('Alex Chen', 'A senior engineer', '2026-01-01');
    const md = p.toMarkdown();
    expect(md).toContain('---');
    expect(md).toContain('type: persona');
    expect(md).toContain('# Persona: Alex Chen');
    expect(md).toContain('A senior engineer');
  });
});
