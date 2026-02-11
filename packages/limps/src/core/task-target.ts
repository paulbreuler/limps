import type { ServerConfig } from '../config.js';
import { resolveTaskId } from '../cli/task-resolver.js';

export function resolveTaskIdFromPlanAndAgent(
  config: ServerConfig,
  planId: string,
  agentId: string
): string {
  const resolved = resolveTaskId(agentId, {
    plansPath: config.plansPath,
    planContext: planId,
  });

  return resolved.taskId;
}
