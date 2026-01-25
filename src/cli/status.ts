/**
 * CLI command: status
 * Show plan status summary.
 */

import type { ServerConfig } from '../config.js';
import { findPlanDirectory, getAgentFiles } from './list-agents.js';
import type { AgentFrontmatter } from '../agent-parser.js';

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
