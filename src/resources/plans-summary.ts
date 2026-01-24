import { existsSync, readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import type { ResourceContext, ResourceResult } from '../types.js';

/**
 * Plan summary interface.
 */
export interface PlanSummary {
  id: string;
  title: string;
  description: string;
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  tasks: {
    id: string;
    title: string;
    status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  }[];
  dependencies: string[];
  nextAction: string;
  taskCounts: {
    GAP: number;
    WIP: number;
    PASS: number;
    BLOCKED: number;
  };
}

/**
 * Parse YAML frontmatter from markdown content.
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

  return { frontmatter, body };
}

/**
 * Extract description from markdown content (first paragraph after title).
 */
function extractDescription(content: string): string {
  // Remove frontmatter if present
  const { body } = parseYamlFrontmatter(content);

  // Remove title (first H1)
  const withoutTitle = body.replace(/^#\s+.+$/m, '').trim();

  // Get first paragraph (non-empty line)
  const lines = withoutTitle.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (
      trimmed &&
      !trimmed.startsWith('#') &&
      !trimmed.startsWith('*') &&
      !trimmed.startsWith('-')
    ) {
      return trimmed.substring(0, 200); // Limit to ~200 chars
    }
  }

  return '';
}

/**
 * Extract task information from agent files.
 */
function extractTasks(
  planPath: string
): { id: string; title: string; status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED' }[] {
  const agentsDir = join(planPath, 'agents');
  if (!existsSync(agentsDir)) {
    return [];
  }

  const tasks: { id: string; title: string; status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED' }[] = [];

  // Check completed directory
  const completedDir = join(agentsDir, 'completed');
  const completedFiles = existsSync(completedDir)
    ? readdirSync(completedDir, { withFileTypes: true })
        .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.agent.md'))
        .map((dirent) => dirent.name)
    : [];

  // Check main agents directory
  const agentFiles = readdirSync(agentsDir, { withFileTypes: true })
    .filter((dirent) => dirent.isFile() && dirent.name.endsWith('.agent.md'))
    .map((dirent) => dirent.name);

  for (const file of agentFiles) {
    const filePath = join(agentsDir, file);
    const content = readFileSync(filePath, 'utf-8');

    // Extract title from first H1 or filename
    const h1Match = content.match(/^#\s+(.+)$/m);
    const title = h1Match ? h1Match[1].trim() : file.replace('.agent.md', '');

    // Extract status from content (look for "Status: GAP/WIP/PASS/BLOCKED")
    const statusMatch = content.match(/Status:\s*(GAP|WIP|PASS|BLOCKED)/i);
    const status = (statusMatch ? statusMatch[1].toUpperCase() : 'GAP') as
      | 'GAP'
      | 'WIP'
      | 'PASS'
      | 'BLOCKED';

    tasks.push({
      id: file.replace('.agent.md', ''),
      title,
      status: completedFiles.includes(file) ? 'PASS' : status,
    });
  }

  // Add completed tasks
  for (const file of completedFiles) {
    if (!agentFiles.includes(file)) {
      const filePath = join(completedDir, file);
      const content = readFileSync(filePath, 'utf-8');
      const h1Match = content.match(/^#\s+(.+)$/m);
      const title = h1Match ? h1Match[1].trim() : file.replace('.agent.md', '');

      tasks.push({
        id: file.replace('.agent.md', ''),
        title,
        status: 'PASS',
      });
    }
  }

  return tasks;
}

/**
 * Extract dependencies from markdown content.
 */
function extractDependencies(content: string, frontmatter: Record<string, unknown>): string[] {
  const deps: string[] = [];

  // Check frontmatter
  if (frontmatter.dependencies) {
    if (Array.isArray(frontmatter.dependencies)) {
      deps.push(...frontmatter.dependencies.map((d) => String(d)));
    } else if (typeof frontmatter.dependencies === 'string') {
      deps.push(frontmatter.dependencies);
    }
  }

  // Extract from content: #1, #2, feature-1, etc.
  const featureRefRegex = /#(\d+)|feature[_-]?(\d+)/gi;
  const matches = content.matchAll(featureRefRegex);

  for (const match of matches) {
    if (match[1]) {
      deps.push(`#${match[1]}`);
    } else if (match[2]) {
      deps.push(`feature-${match[2]}`);
    }
  }

  return Array.from(new Set(deps));
}

/**
 * Get next action from first GAP task.
 */
function getNextAction(
  tasks: { id: string; title: string; status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED' }[]
): string {
  const gapTask = tasks.find((t) => t.status === 'GAP');
  if (gapTask) {
    return `Work on ${gapTask.title} (${gapTask.id})`;
  }

  const wipTask = tasks.find((t) => t.status === 'WIP');
  if (wipTask) {
    return `Continue ${wipTask.title} (${wipTask.id})`;
  }

  return 'All tasks complete';
}

/**
 * Handle plans://summary/{planId} resource request.
 * Returns plan summary with task counts, status rollup, and dependencies.
 *
 * @param uri - Resource URI (should be 'plans://summary/{planId}')
 * @param context - Resource context
 * @returns Resource result with plan summary
 */
export async function handlePlanSummary(
  uri: string,
  context: ResourceContext
): Promise<ResourceResult> {
  const { db, config } = context;
  const plansPath = config.plansPath;

  // Extract planId from URI (plans://summary/{planId})
  const match = uri.match(/^plans:\/\/summary\/(.+)$/);
  if (!match) {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'Invalid URI format' }),
        },
      ],
    };
  }

  const planId = match[1];
  const planPath = join(plansPath, planId);
  const planMdPath = join(planPath, 'plan.md');

  // Check if plan exists
  if (!existsSync(planMdPath)) {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'Plan not found', planId }),
        },
      ],
    };
  }

  // Get plan content from database
  const docResult = db
    .prepare('SELECT title, content FROM documents WHERE path = ?')
    .get(planMdPath) as
    | {
        title: string;
        content: string;
      }
    | undefined;

  if (!docResult) {
    return {
      contents: [
        {
          uri,
          mimeType: 'application/json',
          text: JSON.stringify({ error: 'Plan not indexed', planId }),
        },
      ],
    };
  }

  const { frontmatter } = parseYamlFrontmatter(docResult.content);
  const status = (
    frontmatter.status && typeof frontmatter.status === 'string' ? frontmatter.status : 'GAP'
  ) as 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';

  const title = docResult.title;
  const description = extractDescription(docResult.content);
  const dependencies = extractDependencies(docResult.content, frontmatter);
  const tasks = extractTasks(planPath);

  // Count tasks by status
  const taskCounts = {
    GAP: tasks.filter((t) => t.status === 'GAP').length,
    WIP: tasks.filter((t) => t.status === 'WIP').length,
    PASS: tasks.filter((t) => t.status === 'PASS').length,
    BLOCKED: tasks.filter((t) => t.status === 'BLOCKED').length,
  };

  const nextAction = getNextAction(tasks);

  const summary: PlanSummary = {
    id: planId,
    title,
    description,
    status,
    tasks,
    dependencies,
    nextAction,
    taskCounts,
  };

  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(summary),
      },
    ],
  };
}
