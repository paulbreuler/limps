import { describe, it, expect, beforeEach } from 'vitest';
import { createAcpTools } from '../../src/acp/tools.js';
import { AcpSessionManager } from '../../src/acp/session-manager.js';
import type { AcpToolContext } from '../../src/acp/tools.js';

describe('ACP Tools', () => {
  let context: AcpToolContext;

  beforeEach(() => {
    context = {
      sessionManager: new AcpSessionManager(),
    };
  });

  it('should export all 5 tool handlers', () => {
    const tools = createAcpTools(context);
    expect(tools).toHaveProperty('claim_task');
    expect(tools).toHaveProperty('update_status');
    expect(tools).toHaveProperty('create_artifact');
    expect(tools).toHaveProperty('validate_invest');
    expect(tools).toHaveProperty('list_tasks');
  });

  describe('claim_task', () => {
    it('should return a task stub with planId', async () => {
      const tools = createAcpTools(context);
      const result = await tools.claim_task({ planId: '0001-feature' });
      expect(result.taskId).toBe('0001-feature#000');
      expect(result.title).toBe('Unclaimed task');
      expect(result.frontmatter).toEqual({});
      expect(result.files).toEqual([]);
    });

    it('should return unknown taskId without planId', async () => {
      const tools = createAcpTools(context);
      const result = await tools.claim_task({});
      expect(result.taskId).toBe('unknown');
    });
  });

  describe('update_status', () => {
    it('should update status and emit event', async () => {
      const tools = createAcpTools(context);
      const result = await tools.update_status({
        taskId: '0001-feature#001',
        status: 'WIP',
      });
      expect(result.ok).toBe(true);
      expect(result.taskId).toBe('0001-feature#001');
      expect(result.status).toBe('WIP');
    });
  });

  describe('create_artifact', () => {
    it('should return ok response', async () => {
      const tools = createAcpTools(context);
      const result = await tools.create_artifact({ type: 'code', path: '/tmp/test.ts' });
      expect(result.ok).toBe(true);
    });
  });

  describe('validate_invest', () => {
    it('should return score and warnings', async () => {
      const tools = createAcpTools(context);
      const result = await tools.validate_invest({ content: '# Some plan content' });
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.warnings)).toBe(true);
    });
  });

  describe('list_tasks', () => {
    it('should return empty array (stub)', async () => {
      const tools = createAcpTools(context);
      const result = await tools.list_tasks({});
      expect(Array.isArray(result)).toBe(true);
      expect(result).toHaveLength(0);
    });
  });
});
