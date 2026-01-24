import { existsSync, readdirSync } from 'fs';
import { join } from 'path';
import type { Database as DatabaseType } from 'better-sqlite3';
import type { ResourceContext, ResourceResult } from '../types.js';

/**
 * Plan index entry interface.
 */
export interface PlanIndexEntry {
  id: string;
  title: string;
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  taskCount: number;
  completedCount: number;
}

/**
 * Plan index interface.
 */
export interface PlanIndex {
  plans: PlanIndexEntry[];
  totalPlans: number;
  totalTasks: number;
  completedTasks: number;
}

/**
 * Extract plan number from directory name.
 * Handles both padded (0001-plan-name) and unpadded (1-plan-name) formats.
 */
function extractPlanNumber(dirName: string): number | null {
  const match = dirName.match(/^0*(\d+)-/);
  if (match) {
    return parseInt(match[1], 10);
  }
  return null;
}

/**
 * Parse YAML frontmatter from markdown content.
 * Returns parsed frontmatter and remaining content.
 */
function parseYamlFrontmatter(content: string): {
  frontmatter: Record<string, unknown>;
  body: string;
} {
  const yamlRegex = /^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/;
  const match = content.match(yamlRegex);

  if (!match) {
    return { frontmatter: {}, body: content };
  }

  const frontmatterText = match[1];
  const body = match[2];
  const frontmatter: Record<string, unknown> = {};

  // Simple YAML parser for basic key-value pairs
  const lines = frontmatterText.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: unknown = trimmed.slice(colonIndex + 1).trim();

    // Remove quotes if present
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

  return { frontmatter, body };
}

/**
 * Get plan status from database content or default to GAP.
 */
function getPlanStatus(db: DatabaseType, planPath: string): 'GAP' | 'WIP' | 'PASS' | 'BLOCKED' {
  const planMdPath = join(planPath, 'plan.md');
  const result = db.prepare('SELECT content FROM documents WHERE path = ?').get(planMdPath) as
    | {
        content: string;
      }
    | undefined;

  if (result?.content) {
    const { frontmatter } = parseYamlFrontmatter(result.content);
    if (frontmatter.status && typeof frontmatter.status === 'string') {
      const status = frontmatter.status as 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
      if (['GAP', 'WIP', 'PASS', 'BLOCKED'].includes(status)) {
        return status;
      }
    }
  }

  return 'GAP';
}

/**
 * Count tasks in a plan by scanning agent files.
 */
function countTasks(planPath: string): { total: number; completed: number } {
  const agentsDir = join(planPath, 'agents');
  if (!existsSync(agentsDir)) {
    return { total: 0, completed: 0 };
  }

  const files = readdirSync(agentsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.agent.md'))
    .map((dirent) => dirent.name);

  const total = files.length;
  const completedDir = join(agentsDir, 'completed');
  const completed = existsSync(completedDir)
    ? readdirSync(completedDir, { withFileTypes: true }).filter(
        (dirent) => dirent.isFile() && dirent.name.endsWith('.agent.md')
      ).length
    : 0;

  return { total, completed };
}

/**
 * Handle plans://index resource request.
 * Returns lightweight index of all plans with status summary.
 *
 * @param uri - Resource URI (should be 'plans://index')
 * @param context - Resource context
 * @returns Resource result with plan index
 */
export async function handlePlansIndex(
  uri: string,
  context: ResourceContext
): Promise<ResourceResult> {
  const { db, config } = context;
  const plansPath = config.plansPath;

  if (!existsSync(plansPath)) {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({
            plans: [],
            totalPlans: 0,
            totalTasks: 0,
            completedTasks: 0,
          } as PlanIndex),
        },
      ],
    };
  }

  const dirs = readdirSync(plansPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const planEntries: PlanIndexEntry[] = [];
  let totalTasks = 0;
  let completedTasks = 0;

  for (const dir of dirs) {
    const planNumber = extractPlanNumber(dir);
    if (planNumber === null) {
      continue; // Skip directories that don't match plan number pattern
    }

    const planPath = join(plansPath, dir);
    const planMdPath = join(planPath, 'plan.md');

    // Check if plan.md exists
    if (!existsSync(planMdPath)) {
      continue;
    }

    // Get plan title from database
    const docResult = db.prepare('SELECT title FROM documents WHERE path = ?').get(planMdPath) as
      | {
          title: string;
        }
      | undefined;

    const title = docResult?.title || dir;
    const status = getPlanStatus(db, planPath);
    const { total, completed } = countTasks(planPath);

    planEntries.push({
      id: dir,
      title,
      status,
      taskCount: total,
      completedCount: completed,
    });

    totalTasks += total;
    completedTasks += completed;
  }

  // Sort by plan number (numerically)
  planEntries.sort((a, b) => {
    const numA = extractPlanNumber(a.id) ?? 0;
    const numB = extractPlanNumber(b.id) ?? 0;
    return numA - numB;
  });

  const index: PlanIndex = {
    plans: planEntries,
    totalPlans: planEntries.length,
    totalTasks,
    completedTasks,
  };

  // Approximate token count (character count / 4)
  const jsonText = JSON.stringify(index);
  const tokenCount = Math.ceil(jsonText.length / 4);

  // If token count exceeds ~100 tokens, truncate plans list
  // This is a lightweight index, so we want to keep it small
  if (tokenCount > 100) {
    // Keep only first N plans to stay under limit
    const maxPlans = Math.floor((100 * 4) / (jsonText.length / planEntries.length));
    index.plans = planEntries.slice(0, Math.max(1, maxPlans));
  }

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(index),
      },
    ],
  };
}
