/**
 * CLI command: next-task
 * Get the next best task with scoring breakdown.
 */

import type { ServerConfig } from '../config.js';
import { readCoordination, type CoordinationState } from '../coordination.js';
import { type ParsedAgentFile, resolveDependency } from '../agent-parser.js';
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
 * Calculate dependency score (40% weight).
 * Higher score when all dependencies are satisfied.
 */
function calculateDependencyScore(
  agent: ParsedAgentFile,
  coordination: CoordinationState
): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const deps = agent.frontmatter.dependencies;

  if (deps.length === 0) {
    reasons.push('No dependencies (unblocked)');
    return { score: 40, reasons };
  }

  let satisfiedCount = 0;
  for (const dep of deps) {
    const taskId = resolveDependency(dep, agent.planFolder);
    if (taskId) {
      const depTask = coordination.tasks[taskId];
      if (depTask && depTask.status === 'PASS') {
        satisfiedCount++;
      }
    }
  }

  if (satisfiedCount === deps.length) {
    reasons.push(`All ${deps.length} dependencies satisfied`);
    return { score: 40, reasons };
  }

  const unsatisfied = deps.length - satisfiedCount;
  reasons.push(`${unsatisfied}/${deps.length} dependencies not satisfied`);
  return { score: 0, reasons };
}

/**
 * Calculate priority score (30% weight).
 * Lower agent numbers get higher priority.
 */
function calculatePriorityScore(agent: ParsedAgentFile): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const agentNum = parseInt(agent.agentNumber, 10);

  // Agents 0-2 get full priority score
  // Score decreases for higher agent numbers
  const score = Math.max(0, 30 - agentNum * 3);
  reasons.push(`Agent #${agentNum} priority: ${score}/30`);

  return { score, reasons };
}

/**
 * Calculate workload score (30% weight).
 * Based on file count - fewer files = easier task = higher score.
 */
function calculateWorkloadScore(agent: ParsedAgentFile): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  const fileCount = agent.frontmatter.files.length;

  // Fewer files = higher score (max 30)
  const score = Math.max(0, 30 - fileCount * 5);
  reasons.push(`${fileCount} files to modify: ${score}/30`);

  return { score, reasons };
}

/**
 * Check if task is eligible (GAP status, no file conflicts).
 */
function isTaskEligible(
  agent: ParsedAgentFile,
  coordination: CoordinationState
): { eligible: boolean; reason?: string } {
  if (agent.frontmatter.status !== 'GAP') {
    return {
      eligible: false,
      reason: `Status is ${agent.frontmatter.status}, not GAP`,
    };
  }

  // Check file conflicts
  for (const file of agent.frontmatter.files) {
    const lockedBy = coordination.fileLocks[file];
    if (lockedBy) {
      return {
        eligible: false,
        reason: `File ${file} is locked by ${lockedBy}`,
      };
    }
  }

  // Check dependency satisfaction
  for (const dep of agent.frontmatter.dependencies) {
    const taskId = resolveDependency(dep, agent.planFolder);
    if (taskId) {
      const depTask = coordination.tasks[taskId];
      if (!depTask || depTask.status !== 'PASS') {
        return {
          eligible: false,
          reason: `Dependency ${dep} not satisfied`,
        };
      }
    }
  }

  return { eligible: true };
}

/**
 * Score a task and return breakdown.
 */
function scoreTask(
  agent: ParsedAgentFile,
  coordination: CoordinationState
): TaskScoreBreakdown | null {
  const eligibility = isTaskEligible(agent, coordination);
  if (!eligibility.eligible) {
    return null;
  }

  const depResult = calculateDependencyScore(agent, coordination);
  const priorityResult = calculatePriorityScore(agent);
  const workloadResult = calculateWorkloadScore(agent);

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

  // Load coordination state
  const coordination = await readCoordination(config.coordinationPath);

  // Score all eligible tasks
  const scoredTasks: TaskScoreBreakdown[] = [];

  for (const agent of agents) {
    const score = scoreTask(agent, coordination);
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

  // Format output
  const lines: string[] = [];
  lines.push('Next Best Task:');
  lines.push('');
  lines.push(`  Task ID: ${best.taskId}`);
  lines.push(`  Title: ${best.title}`);
  lines.push('');
  lines.push('Score Breakdown:');
  lines.push(`  Total Score: ${best.totalScore}/100`);
  lines.push(`  Dependencies: ${best.dependencyScore}/40`);
  lines.push(`  Priority: ${best.priorityScore}/30`);
  lines.push(`  Workload: ${best.workloadScore}/30`);
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
