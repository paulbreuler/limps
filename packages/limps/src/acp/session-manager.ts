import { EventEmitter } from 'events';
import type { AcpSessionEvent } from './types.js';

interface SessionInfo {
  agentId: string;
  connectedAt: string;
  currentTask?: string;
}

export class AcpSessionManager extends EventEmitter {
  private sessions = new Map<string, SessionInfo>();

  registerSession(agentId: string): void {
    this.sessions.set(agentId, {
      agentId,
      connectedAt: new Date().toISOString(),
    });
    this.emitEvent({
      type: 'agent_connected',
      agentId,
      timestamp: new Date().toISOString(),
    });
  }

  removeSession(agentId: string): void {
    this.sessions.delete(agentId);
    this.emitEvent({
      type: 'agent_disconnected',
      agentId,
      timestamp: new Date().toISOString(),
    });
  }

  assignTask(agentId: string, taskId: string): void {
    const session = this.sessions.get(agentId);
    if (session) {
      session.currentTask = taskId;
      this.emitEvent({
        type: 'task_claimed',
        agentId,
        taskId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  updateTaskStatus(taskId: string, status: string): void {
    this.emitEvent({
      type: 'status_updated',
      taskId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  getSessions(): SessionInfo[] {
    return Array.from(this.sessions.values());
  }

  private emitEvent(event: AcpSessionEvent): void {
    this.emit('acp:event', event);
  }
}
