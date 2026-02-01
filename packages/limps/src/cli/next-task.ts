/**
 * CLI command: next-task
 * Get the next best task with scoring breakdown.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import {
  type ServerConfig,
  type ScoringWeights,
  type ScoringBiases,
  getScoringWeights,
  getScoringBiases,
} from '../config.js';
import { type ParsedAgentFile } from '../agent-parser.js';
import { findPlanDirectory, getAgentFiles } from './list-agents.js';
import { FrontmatterHandler } from '../utils/frontmatter.js';

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
  biasScore: number;
  reasons: string[];
}

type PlanPriority = 'low' | 'medium' | 'high' | 'critical';

const PLAN_SIGNAL_WEIGHTS: Record<PlanPriority, number> = {
  low: 0,
  medium: 5,
  high: 10,
  critical: 20,
};

const frontmatterHandler = new FrontmatterHandler();

function normalizePlanSignal(value: unknown): PlanPriority | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'critical'
  ) {
    return normalized;
  }
  return undefined;
}

function detectPlanSignalKeys(content: string): boolean {
  return /(^|\n)\s*priority\s*:/i.test(content) || /(^|\n)\s*severity\s*:/i.test(content);
}

function getPlanBiasFromFrontmatter(planDir: string): number {
  const planFolder = planDir.split('/').pop();
  if (!planFolder) {
    return 0;
  }
  const planFilePath = join(planDir, `${planFolder}-plan.md`);
  if (!existsSync(planFilePath)) {
    return 0;
  }
  const content = readFileSync(planFilePath, 'utf-8');
  try {
    const parsed = frontmatterHandler.parse(content);
    const priority = normalizePlanSignal(parsed.frontmatter.priority);
    const severity = normalizePlanSignal(parsed.frontmatter.severity);
    if (!priority && !severity && content.startsWith('---') && detectPlanSignalKeys(content)) {
      console.warn(
        `Malformed frontmatter in plan file: ${planFilePath}. Run \`limps repair-plans --check --json\` for a structured report.`
      );
      return 0;
    }
    const priorityWeight = priority ? PLAN_SIGNAL_WEIGHTS[priority] : 0;
    const severityWeight = severity ? PLAN_SIGNAL_WEIGHTS[severity] : 0;
    return priorityWeight + severityWeight;
  } catch {
    if (detectPlanSignalKeys(content)) {
      console.warn(
        `Malformed frontmatter in plan file: ${planFilePath}. Run \`limps repair-plans --check --json\` for a structured report.`
      );
    }
    return 0;
  }
}

function applyPlanBias(biases: ScoringBiases, planFolder: string, planBias: number): ScoringBiases {
  if (planBias === 0) {
    return biases;
  }
  const existingPlanBias = biases.plans?.[planFolder] ?? 0;
  return {
    ...biases,
    plans: {
      ...(biases.plans ?? {}),
      [planFolder]: existingPlanBias + planBias,
    },
  };
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
 * Calculate bias score.
 * Biases add or subtract from the total score based on plan, persona, or status.
 *
 * @param agent - Agent to score
 * @param biases - Scoring biases configuration
 */
function calculateBiasScore(
  agent: ParsedAgentFile,
  biases: ScoringBiases
): { score: number; reasons: string[] } {
  let score = 0;
  const reasons: string[] = [];

  // Plan bias
  if (biases.plans?.[agent.planFolder]) {
    const bias = biases.plans[agent.planFolder];
    score += bias;
    reasons.push(`Plan bias: ${bias > 0 ? '+' : ''}${bias}`);
  }

  // Persona bias
  const persona = agent.frontmatter.persona;
  const personaBias = persona
    ? biases.personas?.[persona as keyof typeof biases.personas]
    : undefined;
  if (personaBias !== undefined) {
    score += personaBias;
    reasons.push(`Persona bias (${persona}): ${personaBias > 0 ? '+' : ''}${personaBias}`);
  }

  // Status bias (mainly for GAP tasks)
  const status = agent.frontmatter.status;
  const statusBias = biases.statuses?.[status as keyof typeof biases.statuses];
  if (statusBias !== undefined) {
    score += statusBias;
    reasons.push(`Status bias (${status}): ${statusBias > 0 ? '+' : ''}${statusBias}`);
  }

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
 * @param biases - Scoring biases configuration
 */
function scoreTask(
  agent: ParsedAgentFile,
  allAgents: ParsedAgentFile[],
  weights: ScoringWeights,
  biases: ScoringBiases
): TaskScoreBreakdown | null {
  const eligibility = isTaskEligible(agent, allAgents);
  if (!eligibility.eligible) {
    return null;
  }

  const depResult = calculateDependencyScore(agent, allAgents, weights.dependency);
  const priorityResult = calculatePriorityScore(agent, weights.priority);
  const workloadResult = calculateWorkloadScore(agent, weights.workload);
  const biasResult = calculateBiasScore(agent, biases);

  const baseScore = depResult.score + priorityResult.score + workloadResult.score;
  // Floor total at 0 (no negative scores)
  const totalScore = Math.max(0, baseScore + biasResult.score);

  return {
    taskId: agent.taskId,
    agentNumber: agent.agentNumber,
    title: agent.title || `Agent ${agent.agentNumber}`,
    totalScore,
    dependencyScore: depResult.score,
    priorityScore: priorityResult.score,
    workloadScore: workloadResult.score,
    biasScore: biasResult.score,
    reasons: [
      ...depResult.reasons,
      ...priorityResult.reasons,
      ...workloadResult.reasons,
      ...biasResult.reasons,
    ],
  };
}

/**
 * Result of getting next task.
 */
export interface NextTaskResult {
  task: TaskScoreBreakdown;
  otherAvailableTasks: number;
}

export interface ScoredTasksResult {
  planName: string;
  tasks: TaskScoreBreakdown[];
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

  const planFolder = planDir.split('/').pop() || planId;
  const planBias = getPlanBiasFromFrontmatter(planDir);

  // Get scoring weights and biases from config
  const weights = getScoringWeights(config);
  const biases = applyPlanBias(getScoringBiases(config), planFolder, planBias);

  // Score all eligible tasks
  const scoredTasks: TaskScoreBreakdown[] = [];

  for (const agent of agents) {
    const score = scoreTask(agent, agents, weights, biases);
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

export function getScoredTasksData(
  config: ServerConfig,
  planId: string
): ScoredTasksResult | { error: string } {
  const planDir = findPlanDirectory(config.plansPath, planId);

  if (!planDir) {
    return { error: `Plan not found: ${planId}` };
  }

  const agents = getAgentFiles(planDir);

  if (agents.length === 0) {
    return { error: 'No agents found' };
  }

  const planFolder = planDir.split('/').pop() || planId;
  const planBias = getPlanBiasFromFrontmatter(planDir);
  const weights = getScoringWeights(config);
  const biases = applyPlanBias(getScoringBiases(config), planFolder, planBias);

  const scoredTasks: TaskScoreBreakdown[] = [];
  for (const agent of agents) {
    const score = scoreTask(agent, agents, weights, biases);
    if (score) {
      scoredTasks.push(score);
    }
  }

  if (scoredTasks.length === 0) {
    const passCount = agents.filter((a) => a.frontmatter.status === 'PASS').length;
    if (passCount === agents.length) {
      return { error: 'All tasks completed!' };
    }
    return { error: 'No available tasks (all blocked or in progress)' };
  }

  scoredTasks.sort((a, b) => b.totalScore - a.totalScore);

  const planName = planDir.split('/').pop() || planId;

  return { planName, tasks: scoredTasks };
}

export function getScoredTaskById(
  config: ServerConfig,
  taskId: string
): { planName: string; task: TaskScoreBreakdown } | { error: string } {
  const [planPart] = taskId.split('#');
  if (!planPart) {
    return { error: `Invalid task ID: ${taskId}` };
  }

  const planDir = findPlanDirectory(config.plansPath, planPart);
  if (!planDir) {
    return { error: `Plan not found: ${planPart}` };
  }

  const agents = getAgentFiles(planDir);
  if (agents.length === 0) {
    return { error: 'No agents found' };
  }

  const target = agents.find((agent) => agent.taskId === taskId);
  if (!target) {
    return { error: `Task not found: ${taskId}` };
  }

  const eligibility = isTaskEligible(target, agents);
  if (!eligibility.eligible) {
    return { error: `Task not available: ${eligibility.reason ?? 'Not eligible'}` };
  }

  const planFolder = planDir.split('/').pop() || planPart;
  const planBias = getPlanBiasFromFrontmatter(planDir);
  const weights = getScoringWeights(config);
  const biases = applyPlanBias(getScoringBiases(config), planFolder, planBias);
  const score = scoreTask(target, agents, weights, biases);

  if (!score) {
    return { error: `Task not available: ${taskId}` };
  }

  const planName = planDir.split('/').pop() || planPart;
  return { planName, task: score };
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
  lines.push(
    `  Total Score: ${best.totalScore}/${totalMax}${best.biasScore !== 0 ? ' (with bias)' : ''}`
  );
  lines.push(`  Dependencies: ${best.dependencyScore}/${weights.dependency}`);
  lines.push(`  Priority: ${best.priorityScore}/${weights.priority}`);
  lines.push(`  Workload: ${best.workloadScore}/${weights.workload}`);
  if (best.biasScore !== 0) {
    lines.push(`  Bias: ${best.biasScore > 0 ? '+' : ''}${best.biasScore}`);
  }
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
  calculateBiasScore,
  isTaskEligible,
  scoreTask,
};
