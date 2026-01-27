/**
 * CLI command: list-plans
 * Lists all plans in the configured plansPath.
 */

import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import type { ServerConfig } from '../config.js';
import { stripMarkdown } from '../utils/markdown.js';
import { findPlanFile } from '../utils/paths.js';

/**
 * Plan entry for CLI output.
 */
export interface CliPlanEntry {
  number: string;
  name: string;
  workType: 'feature' | 'bug' | 'refactor' | 'docs' | 'unknown';
  overview: string;
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
}

/**
 * Extract plan number from directory name.
 * Handles both padded (0001-plan-name) and unpadded (1-plan-name) formats.
 */
export function extractPlanNumber(dirName: string): string | null {
  const match = dirName.match(/^(\d+)-/);
  if (match) {
    return match[1];
  }
  return null;
}

/**
 * Extract plan name from directory name.
 * Removes the number prefix and converts dashes to spaces.
 */
export function extractPlanName(dirName: string): string {
  const match = dirName.match(/^\d+-(.+)$/);
  if (match) {
    return match[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }
  return dirName;
}

/**
 * Detect work type from plan content or directory name.
 */
export function detectWorkType(dirName: string, content: string): CliPlanEntry['workType'] {
  const lowerDir = dirName.toLowerCase();
  const lowerContent = content.toLowerCase();

  if (lowerDir.includes('bug') || lowerContent.includes('bug fix')) {
    return 'bug';
  }
  if (lowerDir.includes('refactor') || lowerContent.includes('refactor')) {
    return 'refactor';
  }
  if (lowerDir.includes('doc') || lowerContent.includes('documentation')) {
    return 'docs';
  }
  if (
    lowerDir.includes('feature') ||
    lowerDir.includes('feat') ||
    lowerContent.includes('feature')
  ) {
    return 'feature';
  }

  return 'unknown';
}

/**
 * Parse YAML frontmatter from content.
 */
function parseYamlFrontmatter(content: string): Record<string, unknown> {
  const yamlRegex = /^---\s*\n([\s\S]*?)\n---\s*\n/;
  const match = content.match(yamlRegex);

  if (!match) {
    return {};
  }

  const frontmatterText = match[1];
  const frontmatter: Record<string, unknown> = {};

  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    if (typeof value === 'string') {
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
    }

    if (key) {
      frontmatter[key] = value;
    }
  }

  return frontmatter;
}

/**
 * Extract overview from plan content.
 * Looks for content after the title and before the first section.
 */
export function extractOverview(content: string): string {
  // Remove frontmatter
  const withoutFrontmatter = content.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, '');

  // Find content between title and first ## heading
  const lines = withoutFrontmatter.split('\n');
  const overviewLines: string[] = [];
  let foundTitle = false;

  for (const line of lines) {
    if (line.startsWith('# ') && !foundTitle) {
      foundTitle = true;
      continue;
    }
    if (foundTitle) {
      if (line.startsWith('## ') || line.startsWith('### ')) {
        break;
      }
      const trimmed = line.trim();
      if (trimmed) {
        // Skip lines that look like raw metadata (e.g., `**Status:** Draft **Date:** 2026-01-15`)
        // These are common when frontmatter leaks into content
        if (/^\*\*[A-Za-z]+\*\*:\s*.*(\*\*[A-Za-z]+\*\*:.*)?$/.test(trimmed)) {
          continue;
        }
        // Skip horizontal rules
        if (/^[-*_]{3,}$/.test(trimmed)) {
          continue;
        }
        overviewLines.push(trimmed);
      }
    }
  }

  const overview = overviewLines.join(' ');
  // Strip markdown for clean CLI display
  const cleaned = stripMarkdown(overview);
  const truncated = cleaned.slice(0, 100);
  return truncated.length === 100 ? truncated + '...' : truncated;
}

/**
 * Get plan status from frontmatter or default.
 */
export function getPlanStatus(content: string): CliPlanEntry['status'] {
  const frontmatter = parseYamlFrontmatter(content);
  if (frontmatter.status && typeof frontmatter.status === 'string') {
    const status = frontmatter.status.toUpperCase();
    if (['GAP', 'WIP', 'PASS', 'BLOCKED'].includes(status)) {
      return status as CliPlanEntry['status'];
    }
  }
  return 'GAP';
}

/**
 * Result of listing plans.
 */
export interface ListPlansResult {
  plans: CliPlanEntry[];
  total: number;
}

/**
 * Get all plans data from the configured plansPath.
 * Returns structured data for rendering.
 *
 * @param config - Server configuration
 * @returns Structured plan data or error message
 */
export function getPlansData(config: ServerConfig): ListPlansResult | { error: string } {
  const plansPath = config.plansPath;

  if (!existsSync(plansPath)) {
    return { error: 'No plans found (plans directory does not exist)' };
  }

  const dirs = readdirSync(plansPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const plans: CliPlanEntry[] = [];

  for (const dir of dirs) {
    const planNumber = extractPlanNumber(dir);
    if (!planNumber) {
      continue;
    }

    const planDir = join(plansPath, dir);
    const planMdPath = findPlanFile(planDir);
    let content = '';

    if (planMdPath) {
      try {
        content = readFileSync(planMdPath, 'utf-8');
      } catch {
        // Ignore read errors
      }
    }

    plans.push({
      number: planNumber,
      name: extractPlanName(dir),
      workType: detectWorkType(dir, content),
      overview: extractOverview(content),
      status: getPlanStatus(content),
    });
  }

  if (plans.length === 0) {
    return { error: 'No plans found' };
  }

  // Sort by plan number
  plans.sort((a, b) => parseInt(a.number, 10) - parseInt(b.number, 10));

  return { plans, total: plans.length };
}

/**
 * List all plans from the configured plansPath.
 *
 * @param config - Server configuration
 * @returns Formatted string output for CLI
 */
export function listPlans(config: ServerConfig): string {
  const result = getPlansData(config);
  if ('error' in result) {
    return result.error;
  }

  const { plans } = result;

  // Format output
  const lines: string[] = [];
  lines.push('Plans:');
  lines.push('');

  for (const plan of plans) {
    const statusIcon = {
      GAP: ' ',
      WIP: '*',
      PASS: '+',
      BLOCKED: '!',
    }[plan.status];

    lines.push(`[${statusIcon}] ${plan.number.padStart(4, '0')} - ${plan.name}`);
    lines.push(`    Type: ${plan.workType} | Status: ${plan.status}`);
    if (plan.overview) {
      lines.push(`    ${plan.overview}`);
    }
    lines.push('');
  }

  lines.push(`Total: ${plans.length} plan(s)`);

  return lines.join('\n');
}
