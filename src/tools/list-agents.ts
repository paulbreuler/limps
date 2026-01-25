/**
 * MCP tool: list_agents
 *
 * Lists all agents for a specific plan with structured data for LLM consumption.
 * Wraps the CLI getAgentsData() function to provide consistent experience.
 */

import { z } from 'zod';
import { getAgentsData } from '../cli/list-agents.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for list_agents tool.
 */
export const ListAgentsInputSchema = z.object({
  planId: z.string().describe('Plan number or name (e.g., "4" or "0004-feature-name")'),
});

/**
 * Handle list_agents tool request.
 * Returns all agents for a plan with number, title, status, persona, and counts.
 *
 * @param input - Tool input with planId
 * @param context - Tool context with config
 * @returns Tool result with agent list or error
 */
export async function handleListAgents(
  input: z.infer<typeof ListAgentsInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const result = getAgentsData(context.config, input.planId);

  if ('error' in result) {
    return {
      content: [
        {
          type: 'text',
          text: result.error,
        },
      ],
      isError: true,
    };
  }

  // Transform agents to cleaner format for LLM
  const agents = result.agents.map((agent) => ({
    agentNumber: agent.agentNumber,
    taskId: agent.taskId,
    title: agent.title || `Agent ${agent.agentNumber}`,
    status: agent.frontmatter.status,
    persona: agent.frontmatter.persona,
    dependencyCount: agent.frontmatter.dependencies.length,
    fileCount: agent.frontmatter.files.length,
  }));

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            planName: result.planName,
            agents,
            statusCounts: result.statusCounts,
            total: result.total,
          },
          null,
          2
        ),
      },
    ],
  };
}
