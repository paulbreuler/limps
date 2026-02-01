/**
 * Agent file parser for MCP planning tools.
 *
 * Agent files use YAML frontmatter as the single source of truth for task state.
 * This module provides functions to parse, update, and query agent files.
 *
 * Task ID Format: `<plan-folder>#<agent-number>` (e.g., "0022-datagrid-stories#000")
 */

import { readFileSync, writeFileSync, statSync, readdirSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { ScoringWeights } from './config.js';

/**
 * Agent file frontmatter interface.
 * This is the authoritative source of truth for agent/task state.
 */
export interface AgentFrontmatter {
  // Core limps fields (required)
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  persona: 'coder' | 'reviewer' | 'pm' | 'customer';
  dependencies: string[]; // Agent numbers this depends on (e.g., ["000", "001"])
  blocks: string[]; // Agent numbers this blocks
  files: string[] | { path: string; action?: string; repo?: string }[]; // Files this agent owns/modifies

  // Obsidian-compatible fields (optional)
  title?: string; // Display title for Obsidian graph view
  tags?: string[]; // Hierarchical tags (e.g., ["limps/agent", "limps/status/gap"])
  aliases?: string[]; // Alternative names for search (e.g., ["#000", "Agent 0"])
  created?: string; // ISO date: YYYY-MM-DD
  updated?: string; // ISO date: YYYY-MM-DD
  scoring?: {
    bias?: number;
    weights?: Partial<ScoringWeights>;
  };
  depends_on?: string[] | string; // Alias for dependencies
}

/**
 * Parsed agent file with frontmatter and metadata.
 */
export interface ParsedAgentFile {
  /** Task ID: planFolder#agentNumber */
  taskId: string;
  /** Plan folder name (e.g., "0022-datagrid-stories") */
  planFolder: string;
  /** Agent number (e.g., "000") */
  agentNumber: string;
  /** Full path to the agent file */
  path: string;
  /** Parsed frontmatter */
  frontmatter: AgentFrontmatter;
  /** Content after frontmatter */
  content: string;
  /** File modification time (for stale detection) */
  mtime: Date;
  /** Title extracted from first # heading */
  title: string;
}

/**
 * Default frontmatter for agent files without frontmatter.
 */
const DEFAULT_FRONTMATTER: AgentFrontmatter = {
  status: 'GAP',
  persona: 'coder',
  dependencies: [],
  blocks: [],
  files: [],
};

function normalizeDependencyValue(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value).padStart(3, '0');
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (/^\d+$/.test(trimmed)) {
      return trimmed.padStart(3, '0');
    }
    return trimmed;
  }
  return null;
}

function normalizeDependencies(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeDependencyValue(entry))
      .filter((entry): entry is string => Boolean(entry));
  }
  const single = normalizeDependencyValue(value);
  return single ? [single] : [];
}

/**
 * Extract agent number from filename.
 *
 * @example
 * extractAgentNumber("000_agent_sticky_header.agent.md") // "000"
 * extractAgentNumber("001_agent_navigation.agent.md") // "001"
 * extractAgentNumber("signalbadge.agent.md") // null (no number prefix)
 *
 * @param filename - Agent filename (not full path)
 * @returns Agent number or null if not found
 */
export function extractAgentNumber(filename: string): string | null {
  // Match leading digits in filename (e.g., "000", "001", "012")
  const match = filename.match(/^(\d+)/);
  return match ? match[1] : null;
}

/**
 * Extract plan folder from agent file path.
 *
 * @example
 * extractPlanFolder("/path/to/plans/0022-datagrid-stories/agents/000_agent.agent.md")
 * // "0022-datagrid-stories"
 *
 * @param path - Full path to agent file
 * @returns Plan folder name or null if not found
 */
export function extractPlanFolder(path: string): string | null {
  // Match plans/<folder>/agents/
  const match = path.match(/plans[/\\]([^/\\]+)[/\\]agents[/\\]/);
  return match ? match[1] : null;
}

/**
 * Build task ID from plan folder and agent number.
 *
 * @example
 * buildTaskId("0022-datagrid-stories", "000") // "0022-datagrid-stories#000"
 *
 * @param planFolder - Plan folder name
 * @param agentNumber - Agent number
 * @returns Task ID in format planFolder#agentNumber
 */
export function buildTaskId(planFolder: string, agentNumber: string): string {
  return `${planFolder}#${agentNumber}`;
}

/**
 * Parse task ID to extract plan folder and agent number.
 *
 * @example
 * parseTaskId("0022-datagrid-stories#000")
 * // { planFolder: "0022-datagrid-stories", agentNumber: "000" }
 *
 * @param taskId - Task ID
 * @returns Parsed components or null if invalid format
 */
export function parseTaskId(taskId: string): { planFolder: string; agentNumber: string } | null {
  const match = taskId.match(/^(.+)#(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    planFolder: match[1],
    agentNumber: match[2],
  };
}

/**
 * Parse YAML frontmatter from content.
 * Returns null if no frontmatter found.
 *
 * @param content - File content
 * @returns Parsed frontmatter and remaining content, or null if no frontmatter
 */
function parseFrontmatter(
  content: string
): { frontmatter: Partial<AgentFrontmatter>; body: string } | null {
  // Frontmatter must start at the beginning of the file
  if (!content.startsWith('---')) {
    return null;
  }

  // Find the closing ---
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return null;
  }

  const yamlContent = content.slice(4, endIndex);
  const body = content.slice(endIndex + 4).trim();

  try {
    const frontmatter = parseYaml(yamlContent) as Partial<AgentFrontmatter>;
    return { frontmatter: frontmatter || {}, body };
  } catch {
    // Invalid YAML - treat as no frontmatter
    return null;
  }
}

/**
 * Extract title from agent file content.
 * Looks for first # heading.
 *
 * @param content - File content (after frontmatter)
 * @returns Title or empty string if not found
 */
function extractTitle(content: string): string {
  const match = content.match(/^#\s+(?:Agent\s+\d+:\s*)?(.+)$/m);
  return match ? match[1].trim() : '';
}

/**
 * Extract status from legacy agent file content (for migration).
 * Looks for Status: `GAP` pattern in content.
 *
 * @param content - File content
 * @returns Status or 'GAP' if not found
 */
function extractLegacyStatus(content: string): AgentFrontmatter['status'] {
  const match = content.match(/Status:\s*`?(\w+)`?/i);
  if (match) {
    const status = match[1].toUpperCase();
    if (['GAP', 'WIP', 'PASS', 'BLOCKED'].includes(status)) {
      return status as AgentFrontmatter['status'];
    }
  }
  return 'GAP';
}

/**
 * Extract persona from legacy agent file content (for migration).
 *
 * @param content - File content
 * @returns Persona or 'coder' if not found
 */
function extractLegacyPersona(content: string): AgentFrontmatter['persona'] {
  const match = content.match(/persona[:\s]+(coder|reviewer|pm|customer)/i);
  if (match) {
    return match[1].toLowerCase() as AgentFrontmatter['persona'];
  }
  return 'coder';
}

/**
 * Extract files from legacy agent file content (for migration).
 * Looks for Own: or Files: patterns.
 *
 * @param content - File content
 * @returns Array of file paths
 */
function extractLegacyFiles(content: string): string[] {
  const files: string[] = [];

  // Look for Own: pattern
  const ownMatch = content.match(/Own:\s*(.+?)(?:\n|$)/i);
  if (ownMatch) {
    const fileMatches = ownMatch[1].matchAll(/`([^`]+)`/g);
    for (const match of fileMatches) {
      files.push(match[1]);
    }
  }

  // Look for Files: patterns in feature sections
  const filesMatches = content.matchAll(/Files:\s*(.+?)(?:\n|$)/gi);
  for (const match of filesMatches) {
    const fileRefs = match[1].matchAll(/`([^`]+)`/g);
    for (const fileRef of fileRefs) {
      if (!files.includes(fileRef[1])) {
        files.push(fileRef[1]);
      }
    }
  }

  return files;
}

/**
 * Extract dependencies from legacy agent file content (for migration).
 * Looks for Depend on: Agent XXX patterns.
 *
 * @param content - File content
 * @returns Array of agent numbers
 */
function extractLegacyDependencies(content: string): string[] {
  const deps: string[] = [];

  const match = content.match(/Depend on:\s*(.+?)(?:\n|$)/i);
  if (match && match[1].toLowerCase() !== 'none') {
    // Look for Agent XXX patterns
    const agentMatches = match[1].matchAll(/Agent\s+(\d+)/gi);
    for (const agentMatch of agentMatches) {
      deps.push(agentMatch[1].padStart(3, '0'));
    }
  }

  return deps;
}

/**
 * Extract blocks from legacy agent file content (for migration).
 * Looks for Block: Agent XXX patterns.
 *
 * @param content - File content
 * @returns Array of agent numbers
 */
function extractLegacyBlocks(content: string): string[] {
  const blocks: string[] = [];

  const match = content.match(/Block:\s*(.+?)(?:\n|$)/i);
  if (match) {
    // Look for Agent XXX patterns
    const agentMatches = match[1].matchAll(/Agent\s+(\d+)/gi);
    for (const agentMatch of agentMatches) {
      blocks.push(agentMatch[1].padStart(3, '0'));
    }
  }

  return blocks;
}

/**
 * Parse an agent file and extract frontmatter and metadata.
 *
 * @param path - Full path to agent file
 * @param content - File content
 * @returns Parsed agent file or null if not a valid agent file
 */
export function parseAgentFile(path: string, content: string): ParsedAgentFile | null {
  // Extract plan folder and agent number from path
  const planFolder = extractPlanFolder(path);
  if (!planFolder) {
    return null;
  }

  // Extract agent number from filename
  const filename = path.split(/[/\\]/).pop() || '';
  const agentNumber = extractAgentNumber(filename);
  if (!agentNumber) {
    return null;
  }

  // Get file mtime
  let mtime: Date;
  try {
    const stats = statSync(path);
    mtime = stats.mtime;
  } catch {
    mtime = new Date();
  }

  // Parse frontmatter
  const parsed = parseFrontmatter(content);

  let frontmatter: AgentFrontmatter;
  let body: string;

  if (parsed) {
    // Merge with defaults
    frontmatter = {
      ...DEFAULT_FRONTMATTER,
      ...parsed.frontmatter,
    };
    const rawFrontmatter = parsed.frontmatter as Record<string, unknown>;
    const dependencyOverrides = normalizeDependencies(rawFrontmatter.depends_on);
    const parsedDependencies = normalizeDependencies(rawFrontmatter.dependencies);
    const mergedDependencies = Array.from(new Set([...parsedDependencies, ...dependencyOverrides]));
    frontmatter.dependencies = mergedDependencies;
    body = parsed.body;
  } else {
    // No frontmatter - extract from legacy format
    frontmatter = {
      status: extractLegacyStatus(content),
      persona: extractLegacyPersona(content),
      dependencies: extractLegacyDependencies(content),
      blocks: extractLegacyBlocks(content),
      files: extractLegacyFiles(content),
    };
    body = content;
  }

  const taskId = buildTaskId(planFolder, agentNumber);
  const title = extractTitle(body);

  return {
    taskId,
    planFolder,
    agentNumber,
    path,
    frontmatter,
    content: body,
    mtime,
    title,
  };
}

/**
 * Read and parse an agent file from disk.
 *
 * @param path - Full path to agent file
 * @returns Parsed agent file or null if not found or invalid
 */
export function readAgentFile(path: string): ParsedAgentFile | null {
  try {
    const content = readFileSync(path, 'utf-8');
    return parseAgentFile(path, content);
  } catch {
    return null;
  }
}

/**
 * Update agent file frontmatter on disk.
 *
 * @param path - Full path to agent file
 * @param updates - Partial frontmatter updates
 * @returns Updated parsed agent file or null on error
 */
export function updateAgentFrontmatter(
  path: string,
  updates: Partial<AgentFrontmatter>
): ParsedAgentFile | null {
  // Read current file
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }

  // Parse current state
  const parsed = parseAgentFile(path, content);
  if (!parsed) {
    return null;
  }

  // Merge updates
  const newFrontmatter: AgentFrontmatter = {
    ...parsed.frontmatter,
    ...updates,
  };

  // Build new content with frontmatter
  const yamlContent = stringifyYaml(newFrontmatter, { lineWidth: 0 }).trim();
  const newContent = `---\n${yamlContent}\n---\n\n${parsed.content}`;

  // Write back
  try {
    writeFileSync(path, newContent, 'utf-8');
  } catch {
    return null;
  }

  // Re-parse and return
  return parseAgentFile(path, newContent);
}

/**
 * Add frontmatter to a legacy agent file (migration helper).
 * Extracts state from content and adds proper YAML frontmatter.
 *
 * @param path - Full path to agent file
 * @returns Updated parsed agent file or null on error
 */
export function migrateAgentFile(path: string): ParsedAgentFile | null {
  // Read current file
  let content: string;
  try {
    content = readFileSync(path, 'utf-8');
  } catch {
    return null;
  }

  // Check if already has frontmatter
  if (content.startsWith('---')) {
    // Already migrated
    return parseAgentFile(path, content);
  }

  // Extract legacy data
  const frontmatter: AgentFrontmatter = {
    status: extractLegacyStatus(content),
    persona: extractLegacyPersona(content),
    dependencies: extractLegacyDependencies(content),
    blocks: extractLegacyBlocks(content),
    files: extractLegacyFiles(content),
  };

  // Build new content with frontmatter
  const yamlContent = stringifyYaml(frontmatter, { lineWidth: 0 }).trim();
  const newContent = `---\n${yamlContent}\n---\n\n${content}`;

  // Write back
  try {
    writeFileSync(path, newContent, 'utf-8');
  } catch {
    return null;
  }

  // Re-parse and return
  return parseAgentFile(path, newContent);
}

/**
 * Check if an agent is stale (WIP status but mtime > threshold).
 *
 * @param agent - Parsed agent file
 * @param thresholdMinutes - Stale threshold in minutes (default 10)
 * @returns true if agent is stale
 */
export function isAgentStale(agent: ParsedAgentFile, thresholdMinutes = 10): boolean {
  if (agent.frontmatter.status !== 'WIP') {
    return false;
  }

  const now = new Date();
  const ageMs = now.getTime() - agent.mtime.getTime();
  const ageMinutes = ageMs / (1000 * 60);

  return ageMinutes > thresholdMinutes;
}

/**
 * Find agent file path by task ID.
 *
 * @param plansPath - Base path to plans directory
 * @param taskId - Task ID in format planFolder#agentNumber
 * @returns Full path to agent file or null if not found
 */
export function findAgentFilePath(plansPath: string, taskId: string): string | null {
  const parsed = parseTaskId(taskId);
  if (!parsed) {
    return null;
  }

  const { planFolder, agentNumber } = parsed;

  // Build path pattern: plans/<planFolder>/agents/<agentNumber>*.agent.md
  const agentsDir = `${plansPath}/${planFolder}/agents`;

  // Try to find matching file
  try {
    const files = readdirSync(agentsDir) as string[];

    for (const file of files) {
      if (file.endsWith('.agent.md') && file.startsWith(agentNumber)) {
        return `${agentsDir}/${file}`;
      }
    }
  } catch {
    // Directory doesn't exist or can't be read
  }

  return null;
}

/**
 * Resolve a dependency reference to a full task ID.
 * Handles both agent numbers ("000") and full task IDs ("0022-plan#000").
 *
 * @param dep - Dependency reference
 * @param currentPlanFolder - Current plan folder for relative references
 * @returns Full task ID or null if invalid
 */
export function resolveDependency(dep: string, currentPlanFolder: string): string | null {
  // If already a full task ID (contains #), return as-is
  if (dep.includes('#')) {
    return dep;
  }

  // If it's just an agent number, prepend current plan folder
  if (/^\d+$/.test(dep)) {
    return buildTaskId(currentPlanFolder, dep);
  }

  return null;
}
