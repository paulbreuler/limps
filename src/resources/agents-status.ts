import type { ResourceContext, ResourceResult } from '../types.js';

/**
 * Agent status interface.
 */
export interface AgentStatus {
  id: string;
  persona: 'coder' | 'reviewer' | 'pm' | 'customer';
  status: 'idle' | 'WIP';
  taskId?: string;
  filesLocked: string[];
  lastHeartbeat: string;
  isStale: boolean; // >5 minutes since heartbeat
}

/**
 * Agents status interface.
 */
export interface AgentsStatus {
  agents: AgentStatus[];
  totalAgents: number;
  activeAgents: number;
  staleAgents: number;
}

/**
 * Check if heartbeat is stale (older than threshold).
 */
function isStaleHeartbeat(heartbeat: string, thresholdMs: number): boolean {
  try {
    const heartbeatTime = new Date(heartbeat).getTime();
    const now = Date.now();
    return now - heartbeatTime > thresholdMs;
  } catch {
    return true; // Invalid date is considered stale
  }
}

/**
 * Handle agents://status resource request.
 * Returns real-time status matrix of all active agents from coordination.json.
 *
 * @param uri - Resource URI (should be 'agents://status')
 * @param context - Resource context
 * @returns Resource result with agents status
 */
export async function handleAgentsStatus(
  uri: string,
  context: ResourceContext
): Promise<ResourceResult> {
  const { coordination, config } = context;
  const heartbeatTimeout = config.heartbeatTimeout || 300000; // Default 5 minutes

  const agents: AgentStatus[] = [];
  let activeAgents = 0;
  let staleAgents = 0;

  // Process all agents from coordination state
  for (const [agentId, agentState] of Object.entries(coordination.agents)) {
    const isStale = isStaleHeartbeat(agentState.heartbeat, heartbeatTimeout);
    const isActive = agentState.status === 'WIP';

    if (isActive) {
      activeAgents++;
    }
    if (isStale) {
      staleAgents++;
    }

    agents.push({
      id: agentId,
      persona: agentState.persona,
      status: agentState.status,
      taskId: agentState.taskId,
      filesLocked: agentState.filesLocked || [],
      lastHeartbeat: agentState.heartbeat,
      isStale,
    });
  }

  // Sort by status (WIP first), then by heartbeat (newest first)
  agents.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === 'WIP' ? -1 : 1;
    }
    const timeA = new Date(a.lastHeartbeat).getTime();
    const timeB = new Date(b.lastHeartbeat).getTime();
    return timeB - timeA; // Descending (newest first)
  });

  const status: AgentsStatus = {
    agents,
    totalAgents: agents.length,
    activeAgents,
    staleAgents,
  };

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(status),
      },
    ],
  };
}
