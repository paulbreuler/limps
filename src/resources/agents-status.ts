import type { ResourceContext, ResourceResult } from '../types.js';

/**
 * Agent status interface.
 * Note: Agent tracking via coordination has been removed.
 * Agent status is now tracked via frontmatter in agent files.
 */
export interface AgentStatus {
  id: string;
  persona: 'coder' | 'reviewer' | 'pm' | 'customer';
  status: 'idle' | 'WIP';
  taskId?: string;
}

/**
 * Agents status interface.
 */
export interface AgentsStatus {
  agents: AgentStatus[];
  totalAgents: number;
  activeAgents: number;
}

/**
 * Handle agents://status resource request.
 * Note: Coordination system has been removed. Agent status is now tracked via frontmatter.
 * This resource returns an empty response for backward compatibility.
 *
 * @param uri - Resource URI (should be 'agents://status')
 * @param _context - Resource context
 * @returns Resource result with empty agents status
 */
export async function handleAgentsStatus(
  uri: string,
  _context: ResourceContext
): Promise<ResourceResult> {
  // Coordination system has been removed
  // Agent status is now tracked via frontmatter in agent files
  const status: AgentsStatus = {
    agents: [],
    totalAgents: 0,
    activeAgents: 0,
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
