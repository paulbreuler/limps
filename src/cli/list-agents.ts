/**
 * CLI command: list-agents
 * Lists all agents in a specific plan.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ServerConfig } from '../config.js';
import { parseAgentFile, type ParsedAgentFile, type AgentFrontmatter } from '../agent-parser.js';

/**
 * Agent entry for CLI output.
 */
export interface CliAgentEntry {
  number: string;
  title: string;
  status: AgentFrontmatter['status'];
  persona: AgentFrontmatter['persona'];
  dependencyCount: number;
  fileCount: number;
}

/**
 * Find plan directory by plan number or name.
 *
 * @param plansPath - Base path to plans
 * @param planId - Plan number (e.g., "4") or full name
 * @returns Full path to plan directory or null
 */
export function findPlanDirectory(plansPath: string, planId: string): string | null {
  if (!existsSync(plansPath)) {
    return null;
  }

  const dirs = readdirSync(plansPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  // Try exact match first
  if (dirs.includes(planId)) {
    return join(plansPath, planId);
  }

  // Try matching by number prefix
  const paddedNumber = planId.padStart(4, '0');
  for (const dir of dirs) {
    if (dir.startsWith(`${paddedNumber}-`) || dir.startsWith(`${planId}-`)) {
      return join(plansPath, dir);
    }
  }

  // Try matching unpadded number
  for (const dir of dirs) {
    const match = dir.match(/^0*(\d+)-/);
    if (match && match[1] === planId) {
      return join(plansPath, dir);
    }
  }

  return null;
}

/**
 * Get all agent files from a plan directory.
 *
 * @param planDir - Path to plan directory
 * @returns Array of parsed agent files
 */
export function getAgentFiles(planDir: string): ParsedAgentFile[] {
  const agentsDir = join(planDir, 'agents');

  if (!existsSync(agentsDir)) {
    return [];
  }

  const files = readdirSync(agentsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.agent.md'))
    .map((dirent) => dirent.name);

  const agents: ParsedAgentFile[] = [];

  for (const file of files) {
    const filePath = join(agentsDir, file);
    try {
      const content = readFileSync(filePath, 'utf-8');
      const parsed = parseAgentFile(filePath, content);
      if (parsed) {
        agents.push(parsed);
      }
    } catch {
      // Skip files that can't be read
    }
  }

  return agents;
}

/**
 * Result of listing agents.
 */
export interface ListAgentsResult {
  planName: string;
  agents: ParsedAgentFile[];
  statusCounts: {
    GAP: number;
    WIP: number;
    PASS: number;
    BLOCKED: number;
  };
  total: number;
}

/**
 * Get all agents data from a plan.
 * Returns structured data for rendering.
 *
 * @param config - Server configuration
 * @param planId - Plan number or name
 * @returns Structured agent data or error
 */
export function getAgentsData(
  config: ServerConfig,
  planId: string
): ListAgentsResult | { error: string } {
  const planDir = findPlanDirectory(config.plansPath, planId);

  if (!planDir) {
    return { error: `Plan not found: ${planId}` };
  }

  const agents = getAgentFiles(planDir);

  if (agents.length === 0) {
    return { error: 'No agents found' };
  }

  // Sort by agent number
  agents.sort((a, b) => {
    const numA = parseInt(a.agentNumber, 10);
    const numB = parseInt(b.agentNumber, 10);
    return numA - numB;
  });

  // Calculate status counts
  const statusCounts = {
    GAP: 0,
    WIP: 0,
    PASS: 0,
    BLOCKED: 0,
  };

  for (const agent of agents) {
    statusCounts[agent.frontmatter.status]++;
  }

  const planName = planDir.split('/').pop() || planId;

  return {
    planName,
    agents,
    statusCounts,
    total: agents.length,
  };
}

/**
 * List all agents in a plan.
 *
 * @param config - Server configuration
 * @param planId - Plan number or name
 * @returns Formatted string output for CLI
 */
export function listAgents(config: ServerConfig, planId: string): string {
  const result = getAgentsData(config, planId);
  if ('error' in result) {
    return result.error;
  }

  const { planName, agents, statusCounts } = result;

  // Format output
  const lines: string[] = [];
  lines.push(`Agents in ${planName}:`);
  lines.push('');

  for (const agent of agents) {
    const statusIcon = {
      GAP: ' ',
      WIP: '*',
      PASS: '+',
      BLOCKED: '!',
    }[agent.frontmatter.status];

    const title = agent.title || `Agent ${agent.agentNumber}`;
    lines.push(`[${statusIcon}] ${agent.agentNumber} - ${title}`);
    lines.push(`    Persona: ${agent.frontmatter.persona} | Status: ${agent.frontmatter.status}`);
    lines.push(
      `    Dependencies: ${agent.frontmatter.dependencies.length} | Files: ${agent.frontmatter.files.length}`
    );
    lines.push('');
  }

  lines.push('Summary:');
  lines.push(
    `  Total: ${agents.length} | PASS: ${statusCounts.PASS} | WIP: ${statusCounts.WIP} | GAP: ${statusCounts.GAP} | BLOCKED: ${statusCounts.BLOCKED}`
  );

  return lines.join('\n');
}
