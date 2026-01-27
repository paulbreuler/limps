/**
 * CLI command: next-task
 * Get the next best task with scoring breakdown.
 */

import { type ServerConfig, type ScoringWeights, getScoringWeights } from '../config.js';
import { type ParsedAgentFile } from '../agent-parser.js';
import { findPlanDirectory, getAgentFiles } from './list-agents.js';

/**
 * Score breakdown for a task.
 */
export interface TaskScoreBreakdown {
  taskId: string;
  agentNumber: string;
  title: string;
  totalScore: number;
  dependencyScore: number;
  priorityScore: number;
  workloadScore: number;
  reasons: string[];
}

/**
 * Calculate dependency score.
 * Higher score when all dependencies are satisfied.
 *
 * @param agent - Agent to score
 * @param allAgents - All agents in the plan
 * @param maxScore - Maximum score for this category (default: 40)
 */
function calculateDependencyScore(
  agent: ParsedAgentFile,
  allAgents: ParsedAgentFile[],
  maxScore = 40
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const deps = agent.frontmatter.dependencies;

  if (deps.length === 0) {
    reasons.push('No dependencies (unblocked)');
    return { score: maxScore, reasons };
  }

  let satisfiedCount = 0;
  for (const dep of deps) {
    // Find the dependent agent by number (deps are just agent numbers like "000")
    const depAgent = allAgents.find((a) => a.agentNumber === dep);
    if (depAgent && depAgent.frontmatter.status === 'PASS') {
      satisfiedCount++;
    }
  }

  if (satisfiedCount === deps.length) {
    reasons.push(`All ${deps.length} dependencies satisfied`);
    return { score: maxScore, reasons };
  }

  const unsatisfied = deps.length - satisfiedCount;
  reasons.push(`${unsatisfied}/${deps.length} dependencies not satisfied`);
  return { score: 0, reasons };
}

/**
 * Calculate priority score.
 * Lower agent numbers get higher priority.
 *
 * @param agent - Agent to score
 * @param maxScore - Maximum score for this category (default: 30)
 */
function calculatePriorityScore(
  agent: ParsedAgentFile,
  maxScore = 30
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const agentNum = parseInt(agent.agentNumber, 10);

  // Agents 0-2 get full priority score
  // Score decreases for higher agent numbers (10% of maxScore per agent number)
  const decrementPerAgent = maxScore * 0.1;
  const score = Math.max(0, maxScore - agentNum * decrementPerAgent);
  reasons.push(`Agent #${agentNum} priority: ${score}/${maxScore}`);

  return { score, reasons };
}

/**
 * Calculate workload score.
 * Based on file count - fewer files = easier task = higher score.
 *
 * @param agent - Agent to score
 * @param maxScore - Maximum score for this category (default: 30)
 */
function calculateWorkloadScore(
  agent: ParsedAgentFile,
  maxScore = 30
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const fileCount = agent.frontmatter.files.length;

  // Fewer files = higher score (approximately 1/6 of maxScore per file)
  const decrementPerFile = maxScore / 6;
  const score = Math.max(0, maxScore - fileCount * decrementPerFile);
  reasons.push(`${fileCount} files to modify: ${score}/${maxScore}`);

  return { score, reasons };
}

/**
 * Check if task is eligible (GAP status, dependencies satisfied).
 */
function isTaskEligible(
  agent: ParsedAgentFile,
  allAgents: ParsedAgentFile[]
): { eligible: boolean; reason?: string } {
  if (agent.frontmatter.status !== 'GAP') {
    return {
      eligible: false,
      reason: `Status is ${agent.frontmatter.status}, not GAP`,
    };
  }

  // Check dependency satisfaction (using agent frontmatter status)
  for (const dep of agent.frontmatter.dependencies) {
    // Find the dependent agent by number (deps are just agent numbers like "000")
    const depAgent = allAgents.find((a) => a.agentNumber === dep);
    if (!depAgent || depAgent.frontmatter.status !== 'PASS') {
      return {
        eligible: false,
        reason: `Dependency ${dep} not satisfied`,
      };
    }
  }

  return { eligible: true };
}

/**
 * Score a task and return breakdown.
 *
 * @param agent - Agent to score
 * @param allAgents - All agents in the plan
 * @param weights - Scoring weights configuration
 */
function scoreTask(
  agent: ParsedAgentFile,
  allAgents: ParsedAgentFile[],
  weights?: ScoringWeights
): TaskScoreBreakdown | null {
  const eligibility = isTaskEligible(agent, allAgents);
  if (!eligibility.eligible) {
    return null;
  }

  const depResult = calculateDependencyScore(agent, allAgents, weights?.dependency);
  const priorityResult = calculatePriorityScore(agent, weights?.priority);
  const workloadResult = calculateWorkloadScore(agent, weights?.workload);

  const totalScore = depResult.score + priorityResult.score + workloadResult.score;

  return {
    taskId: agent.taskId,
    agentNumber: agent.agentNumber,
    title: agent.title || `Agent ${agent.agentNumber}`,
    totalScore,
    dependencyScore: depResult.score,
    priorityScore: priorityResult.score,
    workloadScore: workloadResult.score,
    reasons: [...depResult.reasons, ...priorityResult.reasons, ...workloadResult.reasons],
  };
}

/**
 * Result of getting next task.
 */
export interface NextTaskResult {
  task: TaskScoreBreakdown;
  otherAvailableTasks: number;
}

/**
 * Get the next best task data from a plan.
 * Returns structured data for rendering.
 *
 * @param config - Server configuration
 * @param planId - Plan number or name
 * @returns Structured task data or error message
 */
export async function getNextTaskData(
  config: ServerConfig,
  planId: string
): Promise<NextTaskResult | { error: string }> {
  const planDir = findPlanDirectory(config.plansPath, planId);

  if (!planDir) {
    return { error: `Plan not found: ${planId}` };
  }

  const agents = getAgentFiles(planDir);

  if (agents.length === 0) {
    return { error: 'No agents found' };
  }

  // Get scoring weights from config
  const weights = getScoringWeights(config);

  // Score all eligible tasks
  const scoredTasks: TaskScoreBreakdown[] = [];

  for (const agent of agents) {
    const score = scoreTask(agent, agents, weights);
    if (score) {
      scoredTasks.push(score);
    }
  }

  if (scoredTasks.length === 0) {
    // Check if all tasks are complete
    const passCount = agents.filter((a) => a.frontmatter.status === 'PASS').length;
    if (passCount === agents.length) {
      return { error: 'All tasks completed!' };
    }
    return { error: 'No available tasks (all blocked or in progress)' };
  }

  // Sort by total score (descending)
  scoredTasks.sort((a, b) => b.totalScore - a.totalScore);

  const best = scoredTasks[0];

  return {
    task: best,
    otherAvailableTasks: scoredTasks.length - 1,
  };
}

/**
 * Get the next best task from a plan.
 *
 * @param config - Server configuration
 * @param planId - Plan number or name
 * @returns Formatted string output for CLI
 */
export async function nextTask(config: ServerConfig, planId: string): Promise<string> {
  const result = await getNextTaskData(config, planId);
  if ('error' in result) {
    return result.error;
  }

  const { task: best, otherAvailableTasks } = result;
  const weights = getScoringWeights(config);
  const totalMax = weights.dependency + weights.priority + weights.workload;

  // Format output
  const lines: string[] = [];
  lines.push('Next Best Task:');
  lines.push('');
  lines.push(`  Task ID: ${best.taskId}`);
  lines.push(`  Title: ${best.title}`);
  lines.push('');
  lines.push('Score Breakdown:');
  lines.push(`  Total Score: ${best.totalScore}/${totalMax}`);
  lines.push(`  Dependencies: ${best.dependencyScore}/${weights.dependency}`);
  lines.push(`  Priority: ${best.priorityScore}/${weights.priority}`);
  lines.push(`  Workload: ${best.workloadScore}/${weights.workload}`);
  lines.push('');
  lines.push('Scoring Reasons:');
  for (const reason of best.reasons) {
    lines.push(`  - ${reason}`);
  }

  if (otherAvailableTasks > 0) {
    lines.push('');
    lines.push(`Other available tasks: ${otherAvailableTasks}`);
  }

  return lines.join('\n');
}

// Export scoring functions for testing
export {
  calculateDependencyScore,
  calculatePriorityScore,
  calculateWorkloadScore,
  isTaskEligible,
  scoreTask,
};
