/**
 * Health check: Status inference.
 *
 * Suggests status updates for agents based on conservative rules.
 * Inference is suggest-only; never auto-applies.
 */

import type { ServerConfig } from '../config.js';
import { findPlanDirectory, getAgentFiles } from './list-agents.js';
import type { AgentFrontmatter } from '../agent-parser.js';

/**
 * A single status inference suggestion.
 */
export interface StatusInferenceEntry {
  /** Task ID (planFolder#agentNumber) */
  taskId: string;
  /** Agent number */
  agentNumber: string;
  /** Agent title */
  agentTitle: string;
  /** Path to agent file */
  agentPath: string;
  /** Current status in frontmatter */
  currentStatus: AgentFrontmatter['status'];
  /** Suggested status */
  suggestedStatus: AgentFrontmatter['status'];
  /** Confidence 0–1 */
  confidence: number;
  /** Human-readable reasons */
  reasons: string[];
}

/**
 * Result of an inference run.
 */
export interface InferStatusResult {
  suggestions: StatusInferenceEntry[];
  agentsChecked: number;
  error?: string;
}

/**
 * Infer status suggestions for a plan's agents using conservative rules.
 *
 * Rules (suggest only, never auto-apply):
 * - Any → BLOCKED: Body contains "blocked" or "waiting" (case-insensitive)
 * - WIP → PASS: All dependencies are PASS (low confidence, no drift check here)
 *
 * @param config - Server configuration
 * @param planId - Plan number or name
 * @param options - Optional agent filter and min confidence
 * @returns Inference result with suggestions
 */
export function inferStatus(
  config: ServerConfig,
  planId: string,
  options?: { agentNumber?: string; minConfidence?: number }
): InferStatusResult {
  const result: InferStatusResult = {
    suggestions: [],
    agentsChecked: 0,
  };

  const planDir = findPlanDirectory(config.plansPath, planId);
  if (!planDir) {
    result.error = `Plan not found: ${planId}`;
    return result;
  }

  let agents = getAgentFiles(planDir);
  if (options?.agentNumber) {
    agents = agents.filter((a) => a.agentNumber === options.agentNumber);
  }

  result.agentsChecked = agents.length;

  const statusByNumber = new Map<string, AgentFrontmatter['status']>();
  for (const a of getAgentFiles(planDir)) {
    statusByNumber.set(a.agentNumber, a.frontmatter.status);
  }

  const minConfidence = options?.minConfidence ?? 0;

  for (const agent of agents) {
    const { frontmatter, content, path, taskId, agentNumber, title } = agent;
    const currentStatus = frontmatter.status;

    // Rule: body mentions "blocked" or "waiting" → suggest BLOCKED
    const agentBodyLower = (content || '').toLowerCase();
    if (
      (currentStatus === 'GAP' || currentStatus === 'WIP') &&
      (agentBodyLower.includes('blocked') || agentBodyLower.includes('waiting'))
    ) {
      const confidence = 0.7;
      if (confidence >= minConfidence) {
        result.suggestions.push({
          taskId,
          agentNumber,
          agentTitle: title || 'Untitled',
          agentPath: path,
          currentStatus,
          suggestedStatus: 'BLOCKED',
          confidence,
          reasons: ['Agent body mentions "blocked" or "waiting".'],
        });
      }
    }

    // Rule: WIP and all dependencies PASS → suggest PASS (low confidence)
    if (currentStatus === 'WIP' && frontmatter.dependencies.length > 0) {
      const depsAllPass = frontmatter.dependencies.every(
        (dep) => statusByNumber.get(dep) === 'PASS'
      );
      if (depsAllPass) {
        const confidence = 0.5;
        if (confidence >= minConfidence) {
          result.suggestions.push({
            taskId,
            agentNumber,
            agentTitle: title || 'Untitled',
            agentPath: path,
            currentStatus,
            suggestedStatus: 'PASS',
            confidence,
            reasons: ['All dependencies are PASS. Consider marking complete if work is done.'],
          });
        }
      }
    }
  }

  return result;
}
