export interface AcpConfig {
  port: number;
  host?: string;
}

export interface ClaimTaskRequest {
  planId?: string;
  agentId?: string;
}

export interface ClaimTaskResponse {
  taskId: string;
  title: string;
  frontmatter: Record<string, unknown>;
  primerContent: string | null;
  files: string[];
}

export interface UpdateStatusRequest {
  taskId: string;
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  notes?: string;
}

export interface UpdateStatusResponse {
  ok: boolean;
  taskId: string;
  status: string;
}

export interface ListTasksRequest {
  planId?: string;
  status?: string;
}

export interface AcpSessionEvent {
  type: 'agent_connected' | 'task_claimed' | 'status_updated' | 'agent_disconnected';
  agentId?: string;
  taskId?: string;
  status?: string;
  timestamp: string;
}
