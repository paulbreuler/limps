import { describe, it, expect } from 'vitest';
import { AgentTask } from '../../src/documents/agent-task.js';

describe('AgentTask', () => {
  it('should create with correct defaults', () => {
    const task = new AgentTask({ title: 'Add auth', planId: '0001-auth' });
    expect(task.type).toBe('agent');
    expect(task.title).toBe('Add auth');
    expect(task.planId).toBe('0001-auth');
    expect(task.persona).toBe('coder');
    expect(task.dependencies).toEqual([]);
    expect(task.blocks).toEqual([]);
    expect(task.files).toEqual([]);
    expect(task.id).toHaveLength(8);
  });

  it('should generate stable id from planId and title', () => {
    const t1 = new AgentTask({ title: 'Add auth', planId: '0001-auth' });
    const t2 = new AgentTask({ title: 'Add auth', planId: '0001-auth' });
    expect(t1.id).toBe(t2.id);
  });

  it('should produce valid frontmatter with GAP status', () => {
    const task = new AgentTask({
      title: 'Add auth',
      planId: '0001-auth',
      files: ['src/auth.ts'],
      dependencies: ['0001-auth#001'],
    });
    const fm = task.frontmatter();
    expect(fm.type).toBe('agent');
    expect(fm.status).toBe('GAP');
    expect(fm.files).toEqual(['src/auth.ts']);
    expect(fm.dependencies).toEqual(['0001-auth#001']);
    expect(fm.tags).toContain('limps/agent');
    expect(fm.tags).toContain('limps/status/gap');
  });

  it('should produce sections map', () => {
    const task = new AgentTask({ title: 'Test', planId: '0001' });
    const sections = task.sections();
    expect(sections.has('Task')).toBe(true);
    expect(sections.has('Acceptance Criteria')).toBe(true);
    expect(sections.has('Files to Modify')).toBe(true);
    expect(sections.has('Verification')).toBe(true);
  });

  it('should render valid markdown with frontmatter', () => {
    const task = new AgentTask({
      title: 'Add auth',
      planId: '0001-auth',
      files: ['src/auth.ts'],
      created: '2026-01-01',
    });
    const md = task.toMarkdown();
    expect(md).toContain('---');
    expect(md).toContain('type: agent');
    expect(md).toContain('status: GAP');
    expect(md).toContain('# Agent: Add auth');
    expect(md).toContain('`src/auth.ts`');
  });

  it('should include primer content when provided', () => {
    const task = new AgentTask({
      title: 'Add auth',
      planId: '0001-auth',
      primerPath: './PRIMER.md',
      primerContent: '# Project Context\nUse TypeScript.',
    });
    const md = task.toMarkdown();
    expect(md).toContain('LIMPS:PRIMER');
    expect(md).toContain('Project Context');
  });
});
