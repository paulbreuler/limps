import { describe, it, expect } from 'vitest';
import { AcpSessionManager } from '../../src/acp/session-manager.js';

describe('useAcpEvents hook logic', () => {
  it('should receive events from session manager', () => {
    const manager = new AcpSessionManager();
    const events: unknown[] = [];
    manager.on('acp:event', (evt) => events.push(evt));
    manager.registerSession('agent-1');
    expect(events).toHaveLength(1);
    expect((events[0] as { type: string }).type).toBe('agent_connected');
  });

  it('should receive multiple event types', () => {
    const manager = new AcpSessionManager();
    const events: unknown[] = [];
    manager.on('acp:event', (evt) => events.push(evt));

    manager.registerSession('agent-1');
    manager.assignTask('agent-1', 'task-1');
    manager.updateTaskStatus('task-1', 'WIP');
    manager.removeSession('agent-1');

    expect(events).toHaveLength(4);
    expect((events[0] as { type: string }).type).toBe('agent_connected');
    expect((events[1] as { type: string }).type).toBe('task_claimed');
    expect((events[2] as { type: string }).type).toBe('status_updated');
    expect((events[3] as { type: string }).type).toBe('agent_disconnected');
  });
});
