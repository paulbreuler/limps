/**
 * Task ID resolution utilities.
 * Supports multiple formats: full path, full task ID, plan#agent shorthand, agent-only.
 */

import { readdirSync, existsSync } from 'fs';
import { join, basename, dirname } from 'path';
import { planNotFoundError } from '../utils/errors.js';

/**
 * Resolved task identifier with all components.
 */
export interface ResolvedTaskId {
  /** Plan folder name (e.g., "0001-network-panel") */
  planFolder: string;
  /** Agent number (e.g., "002") */
  agentNumber: string;
  /** Full task ID (e.g., "0001-network-panel#002") */
  taskId: string;
  /** Path to the agent file */
  path: string;
}

/**
 * Options for task ID resolution.
 */
export interface ResolveOptions {
  /** Path to plans directory */
  plansPath: string;
  /** Current plan context for agent-only resolution */
  planContext?: string;
}

/**
 * Find plan folders matching a prefix.
 *
 * @param plansPath - Path to plans directory
 * @param prefix - Prefix to match (e.g., "0001", "0001-net")
 * @returns Array of matching plan folder names
 */
export function findPlansByPrefix(plansPath: string, prefix: string): string[] {
  if (!existsSync(plansPath)) {
    return [];
  }

  try {
    const entries = readdirSync(plansPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => {
        // Match by full prefix (e.g., "0001-net" matches "0001-network-panel")
        if (name.startsWith(prefix)) {
          return true;
        }
        // Match by number prefix (e.g., "1" matches "0001-network-panel")
        const numberPart = name.split('-')[0];
        if (numberPart) {
          // Compare as integers to handle leading zeros (e.g., "1" matches "0001")
          const prefixNum = parseInt(prefix, 10);
          const nameNum = parseInt(numberPart, 10);
          return !isNaN(prefixNum) && !isNaN(nameNum) && prefixNum === nameNum;
        }
        return false;
      });
  } catch {
    return [];
  }
}

/**
 * List all available plans in the plans directory.
 *
 * @param plansPath - Path to plans directory
 * @returns Array of plan folder names
 */
export function listAllPlans(plansPath: string): string[] {
  if (!existsSync(plansPath)) {
    return [];
  }

  try {
    const entries = readdirSync(plansPath, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .filter((name) => /^\d{4}-/.test(name)); // Only folders starting with NNNN-
  } catch {
    return [];
  }
}

/**
 * Find the agent file path within a plan folder.
 *
 * @param plansPath - Path to plans directory
 * @param planFolder - Plan folder name
 * @param agentNumber - Agent number (e.g., "002" or "2")
 * @returns Path to agent file if found, null otherwise
 */
function findAgentFile(plansPath: string, planFolder: string, agentNumber: string): string | null {
  const agentsDir = join(plansPath, planFolder, 'agents');
  if (!existsSync(agentsDir)) {
    return null;
  }

  // Normalize agent number to 3-digit format
  const paddedNumber = agentNumber.padStart(3, '0');

  try {
    const files = readdirSync(agentsDir);
    const match = files.find(
      (file) => file.startsWith(`${paddedNumber}_`) && file.endsWith('.agent.md')
    );
    if (match) {
      return join(agentsDir, match);
    }
  } catch {
    // Ignore errors
  }

  return null;
}

/**
 * Resolve task ID from a file path.
 *
 * @param path - Full path to agent file
 * @returns Resolved task ID
 */
function resolveFromPath(path: string): ResolvedTaskId {
  const filename = basename(path);
  const agentsDir = dirname(path);
  const planDir = dirname(agentsDir);
  const planFolder = basename(planDir);

  // Extract agent number from filename (e.g., "002_agent_name.agent.md" -> "002")
  const match = filename.match(/^(\d+)_/);
  if (!match) {
    throw new Error(`Invalid agent file name: ${filename}`);
  }

  const agentNumber = match[1];
  const taskId = `${planFolder}#${agentNumber}`;

  return {
    planFolder,
    agentNumber,
    taskId,
    path,
  };
}

/**
 * Build resolved task ID from plan and agent components.
 *
 * @param plansPath - Path to plans directory
 * @param planFolder - Plan folder name
 * @param agentNumber - Agent number
 * @returns Resolved task ID
 */
function buildResolved(plansPath: string, planFolder: string, agentNumber: string): ResolvedTaskId {
  // Normalize agent number to 3-digit format
  const paddedNumber = agentNumber.padStart(3, '0');

  const path = findAgentFile(plansPath, planFolder, paddedNumber);
  if (!path) {
    throw new Error(
      `Agent ${paddedNumber} not found in plan ${planFolder}. ` +
        `Check that the agent file exists in ${planFolder}/agents/`
    );
  }

  return {
    planFolder,
    agentNumber: paddedNumber,
    taskId: `${planFolder}#${paddedNumber}`,
    path,
  };
}

/**
 * Error thrown when a task ID is ambiguous (matches multiple plans).
 */
export class AmbiguousTaskIdError extends Error {
  readonly prefix: string;
  readonly matches: string[];
  readonly suggestions: string[];

  constructor(prefix: string, matches: string[]) {
    const suggestions = matches.map((m) => `${m}#<agent>`);
    super(
      `Ambiguous plan prefix "${prefix}" matches multiple plans: ${matches.join(', ')}. ` +
        `Please use a more specific prefix.`
    );
    this.name = 'AmbiguousTaskIdError';
    this.prefix = prefix;
    this.matches = matches;
    this.suggestions = suggestions;

    Object.setPrototypeOf(this, AmbiguousTaskIdError.prototype);
  }
}

/**
 * Resolve a task ID from various input formats.
 *
 * Supported formats:
 * - Full path: "/path/to/plans/0001-name/agents/002_agent.agent.md"
 * - Full task ID: "0001-network-panel#002"
 * - Plan prefix + agent: "0001#002", "1#2"
 * - Agent only (requires planContext): "002", "2"
 *
 * @param input - Task identifier in any supported format
 * @param options - Resolution options
 * @returns Resolved task ID with all components
 * @throws {Error} If input format is invalid or resolution fails
 * @throws {AmbiguousTaskIdError} If plan prefix matches multiple plans
 */
export function resolveTaskId(input: string, options: ResolveOptions): ResolvedTaskId {
  // 1. Try as full path
  if (input.includes('/') && input.endsWith('.agent.md')) {
    if (!existsSync(input)) {
      throw new Error(`Agent file not found: ${input}`);
    }
    return resolveFromPath(input);
  }

  // 2. Try as full task ID (contains #)
  if (input.includes('#')) {
    const [planPart, agentPart] = input.split('#');
    if (!planPart || !agentPart) {
      throw new Error(`Invalid task ID format: ${input}. Expected format: <plan>#<agent>`);
    }

    const plans = findPlansByPrefix(options.plansPath, planPart);
    if (plans.length === 0) {
      const allPlans = listAllPlans(options.plansPath);
      throw planNotFoundError(planPart, allPlans);
    }
    if (plans.length > 1) {
      throw new AmbiguousTaskIdError(planPart, plans);
    }

    return buildResolved(options.plansPath, plans[0], agentPart);
  }

  // 3. Try as agent number only (requires context)
  if (/^\d+$/.test(input)) {
    if (!options.planContext) {
      throw new Error(
        `Agent number "${input}" requires --plan context. ` +
          `Use: limps <command> --plan <plan-id> ${input}`
      );
    }

    // Resolve plan context (might be a prefix)
    const plans = findPlansByPrefix(options.plansPath, options.planContext);
    if (plans.length === 0) {
      const allPlans = listAllPlans(options.plansPath);
      throw planNotFoundError(options.planContext, allPlans);
    }
    if (plans.length > 1) {
      throw new AmbiguousTaskIdError(options.planContext, plans);
    }

    return buildResolved(options.plansPath, plans[0], input);
  }

  throw new Error(
    `Invalid task ID format: "${input}". ` +
      `Supported formats: <plan>#<agent>, <agent-number> (with --plan), or full path`
  );
}
