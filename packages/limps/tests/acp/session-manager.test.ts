import { describe, it, expect, beforeEach } from 'vitest';
import { AcpSessionManager } from '../../src/acp/session-manager.js';
import type { AcpSessionEvent } from '../../src/acp/types.js';

describe('AcpSessionManager', () => {
  let manager: AcpSessionManager;

  beforeEach(() => {
    manager = new AcpSessionManager();
  });

  it('should register and retrieve sessions', () => {
    manager.registerSession('agent-1');
    const sessions = manager.getSessions();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].agentId).toBe('agent-1');
    expect(sessions[0].connectedAt).toBeDefined();
  });

  it('should remove sessions', () => {
    manager.registerSession('agent-1');
    manager.removeSession('agent-1');
    expect(manager.getSessions()).toHaveLength(0);
  });

  it('should assign tasks to sessions', () => {
    manager.registerSession('agent-1');
    manager.assignTask('agent-1', '0001-feature#001');
    const sessions = manager.getSessions();
    expect(sessions[0].currentTask).toBe('0001-feature#001');
  });

  it('should not assign tasks to non-existent sessions', () => {
    manager.assignTask('unknown-agent', '0001-feature#001');
    expect(manager.getSessions()).toHaveLength(0);
  });

  it('should emit events on register', () => {
    const events: AcpSessionEvent[] = [];
    manager.on('acp:event', (event: AcpSessionEvent) => events.push(event));

    manager.registerSession('agent-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent_connected');
    expect(events[0].agentId).toBe('agent-1');
  });

  it('should emit events on remove', () => {
    const events: AcpSessionEvent[] = [];
    manager.registerSession('agent-1');
    manager.on('acp:event', (event: AcpSessionEvent) => events.push(event));

    manager.removeSession('agent-1');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('agent_disconnected');
  });

  it('should emit events on task claim', () => {
    const events: AcpSessionEvent[] = [];
    manager.registerSession('agent-1');
    manager.on('acp:event', (event: AcpSessionEvent) => events.push(event));

    manager.assignTask('agent-1', '0001-feature#001');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('task_claimed');
    expect(events[0].taskId).toBe('0001-feature#001');
  });

  it('should emit events on status update', () => {
    const events: AcpSessionEvent[] = [];
    manager.on('acp:event', (event: AcpSessionEvent) => events.push(event));

    manager.updateTaskStatus('0001-feature#001', 'WIP');
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('status_updated');
    expect(events[0].taskId).toBe('0001-feature#001');
    expect(events[0].status).toBe('WIP');
  });

  it('should handle multiple sessions', () => {
    manager.registerSession('agent-1');
    manager.registerSession('agent-2');
    manager.registerSession('agent-3');
    expect(manager.getSessions()).toHaveLength(3);

    manager.removeSession('agent-2');
    expect(manager.getSessions()).toHaveLength(2);
    expect(manager.getSessions().map((s) => s.agentId)).toEqual(['agent-1', 'agent-3']);
  });
});
