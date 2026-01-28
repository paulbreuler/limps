/**
 * CLI command: status
 * Show plan status summary and agent-level details.
 */

import type { ServerConfig } from '../config.js';
import { findPlanDirectory, getAgentFiles } from './list-agents.js';
import { readAgentFile, type AgentFrontmatter } from '../agent-parser.js';
import type { ResolvedTaskId } from './task-resolver.js';

/**
 * Plan status summary.
 */
export interface PlanStatusSummary {
  planName: string;
  totalAgents: number;
  statusCounts: Record<AgentFrontmatter['status'], number>;
  personaCounts: Record<AgentFrontmatter['persona'], number>;
  completionPercentage: number;
  blockedAgents: string[];
  wipAgents: string[];
}

/**
 * Get status summary for a plan.
 *
 * @param config - Server configuration
 * @param planId - Plan number or name
 * @returns Plan status summary
 */
export function getPlanStatusSummary(config: ServerConfig, planId: string): PlanStatusSummary {
  const planDir = findPlanDirectory(config.plansPath, planId);

  if (!planDir) {
    throw new Error(`Plan not found: ${planId}`);
  }

  const agents = getAgentFiles(planDir);
  const planName = planDir.split('/').pop() || planId;

  const statusCounts: Record<AgentFrontmatter['status'], number> = {
    GAP: 0,
    WIP: 0,
    PASS: 0,
    BLOCKED: 0,
  };

  const personaCounts: Record<AgentFrontmatter['persona'], number> = {
    coder: 0,
    reviewer: 0,
    pm: 0,
    customer: 0,
  };

  const blockedAgents: string[] = [];
  const wipAgents: string[] = [];

  for (const agent of agents) {
    statusCounts[agent.frontmatter.status]++;
    personaCounts[agent.frontmatter.persona]++;

    if (agent.frontmatter.status === 'BLOCKED') {
      blockedAgents.push(`${agent.agentNumber}: ${agent.title || 'Untitled'}`);
    }
    if (agent.frontmatter.status === 'WIP') {
      wipAgents.push(`${agent.agentNumber}: ${agent.title || 'Untitled'}`);
    }
  }

  const completionPercentage =
    agents.length > 0 ? Math.round((statusCounts.PASS / agents.length) * 100) : 0;

  return {
    planName,
    totalAgents: agents.length,
    statusCounts,
    personaCounts,
    completionPercentage,
    blockedAgents,
    wipAgents,
  };
}

/**
 * Agent status summary with full details.
 */
export interface AgentStatusSummary {
  /** Full task ID (e.g., "0001-network-panel#002") */
  taskId: string;
  /** Agent title from markdown */
  title: string;
  /** Plan folder name */
  planId: string;
  /** Full plan name */
  planName: string;
  /** Agent number (e.g., "002") */
  agentNumber: string;
  /** Current status */
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  /** Agent persona */
  persona: 'coder' | 'reviewer' | 'pm' | 'customer';
  /** Feature counts from agent content */
  features: {
    total: number;
    pass: number;
    wip: number;
    gap: number;
    blocked: number;
  };
  /** Files from frontmatter */
  files: string[];
  /** Dependency status */
  dependencies: {
    taskId: string;
    title: string;
    status: string;
    satisfied: boolean;
  }[];
}

/**
 * Parse features from agent markdown content.
 * Looks for Status: `GAP` patterns in feature sections.
 *
 * @param content - Agent file content
 * @returns Feature counts
 */
function parseFeatureCounts(content: string): {
  total: number;
  pass: number;
  wip: number;
  gap: number;
  blocked: number;
} {
  const counts = { total: 0, pass: 0, wip: 0, gap: 0, blocked: 0 };

  // Match Status: `STATUS` patterns
  const statusMatches = content.matchAll(/Status:\s*`(GAP|WIP|PASS|BLOCKED)`/gi);
  for (const match of statusMatches) {
    counts.total++;
    const status = match[1].toUpperCase() as 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
    if (status === 'PASS') counts.pass++;
    else if (status === 'WIP') counts.wip++;
    else if (status === 'GAP') counts.gap++;
    else if (status === 'BLOCKED') counts.blocked++;
  }

  return counts;
}

/**
 * Get detailed status summary for a single agent.
 *
 * @param config - Server configuration
 * @param resolvedId - Resolved task ID
 * @returns Agent status summary
 */
export function getAgentStatusSummary(
  config: ServerConfig,
  resolvedId: ResolvedTaskId
): AgentStatusSummary {
  const agentFile = readAgentFile(resolvedId.path);
  if (!agentFile) {
    throw new Error(`Failed to read agent file: ${resolvedId.path}`);
  }

  const { frontmatter, content, title } = agentFile;

  // Parse features from content
  const features = parseFeatureCounts(content);

  // Build dependency status
  const allAgents = getAgentFiles(findPlanDirectory(config.plansPath, resolvedId.planFolder) || '');
  const dependencies = frontmatter.dependencies.map((dep) => {
    const depAgent = allAgents.find((a) => a.agentNumber === dep);
    const depTaskId = `${resolvedId.planFolder}#${dep}`;
    return {
      taskId: depTaskId,
      title: depAgent?.title || `Agent ${dep}`,
      status: depAgent?.frontmatter.status || 'UNKNOWN',
      satisfied: depAgent?.frontmatter.status === 'PASS',
    };
  });

  // Normalize files to string[] (handle both string[] and object[] formats)
  const normalizedFiles = frontmatter.files.map((f) => (typeof f === 'string' ? f : f.path));

  return {
    taskId: resolvedId.taskId,
    title: title || `Agent ${resolvedId.agentNumber}`,
    planId: resolvedId.planFolder.split('-')[0] || resolvedId.planFolder,
    planName: resolvedId.planFolder,
    agentNumber: resolvedId.agentNumber,
    status: frontmatter.status,
    persona: frontmatter.persona,
    features,
    files: normalizedFiles,
    dependencies,
  };
}

/**
 * Format status summary for CLI output.
 *
 * @param config - Server configuration
 * @param planId - Plan number or name
 * @returns Formatted string output for CLI
 */
export function status(config: ServerConfig, planId: string): string {
  const summary = getPlanStatusSummary(config, planId);

  const lines: string[] = [];
  lines.push(`Plan Status: ${summary.planName}`);
  lines.push('='.repeat(40));
  lines.push('');

  // Progress bar
  const barWidth = 20;
  const filledWidth = Math.round((summary.completionPercentage / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const progressBar = '[' + '#'.repeat(filledWidth) + '-'.repeat(emptyWidth) + ']';
  lines.push(`Progress: ${progressBar} ${summary.completionPercentage}%`);
  lines.push('');

  // Agent counts
  lines.push('Agents:');
  lines.push(`  Total:    ${summary.totalAgents}`);
  lines.push(`  Complete: ${summary.statusCounts.PASS}`);
  lines.push(`  Active:   ${summary.statusCounts.WIP}`);
  lines.push(`  Pending:  ${summary.statusCounts.GAP}`);
  lines.push(`  Blocked:  ${summary.statusCounts.BLOCKED}`);
  lines.push('');

  // Persona distribution
  const activePersonas = Object.entries(summary.personaCounts).filter(([, count]) => count > 0);
  if (activePersonas.length > 0) {
    lines.push('By Persona:');
    for (const [persona, count] of activePersonas) {
      lines.push(`  ${persona}: ${count}`);
    }
    lines.push('');
  }

  // Active work
  if (summary.wipAgents.length > 0) {
    lines.push('In Progress:');
    for (const agent of summary.wipAgents) {
      lines.push(`  * ${agent}`);
    }
    lines.push('');
  }

  // Blocked items
  if (summary.blockedAgents.length > 0) {
    lines.push('Blocked:');
    for (const agent of summary.blockedAgents) {
      lines.push(`  ! ${agent}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
