/**
 * Shared task parsing utilities for MCP planning tools.
 *
 * This module provides common functions for parsing tasks from planning documents,
 * used by get-next-task, claim-task, and update-task-status tools.
 */

/**
 * Parsed task interface representing a task extracted from a planning document.
 */
export interface ParsedTask {
  id: string; // "<planId>#<featureNumber>"
  planId: string; // e.g., "0008"
  featureNumber: number; // e.g., 11
  title: string;
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  dependencies: string[]; // Array of feature numbers or task IDs
  files: string[]; // Files owned/modified by this task
  documentPath: string; // Path to document containing task
  agentPersona?: 'coder' | 'reviewer' | 'pm' | 'customer'; // Extracted from agent files
}

/**
 * Extract plan ID from document path.
 * Example: "/path/to/plans/0008-plan-name/plan.md" -> "0008-plan-name"
 *
 * @param path - Document path
 * @returns Plan ID or null if not found
 */
export function extractPlanId(path: string): string | null {
  const plansMatch = path.match(/plans[/\\]([^/\\]+)/);
  if (!plansMatch) {
    return null;
  }
  return plansMatch[1];
}

/**
 * Parse tasks from a planning document.
 * Extracts features marked with ### #<number>: pattern.
 *
 * @param path - Document path
 * @param content - Document content
 * @param planId - Plan ID for task ID generation
 * @returns Array of parsed tasks
 */
export function parseTasksFromDocument(
  path: string,
  content: string,
  planId: string
): ParsedTask[] {
  const tasks: ParsedTask[] = [];

  // Match feature markers: ### #<number>: <title>
  const featureRegex = /^###\s+#(\d+):\s+(.+)$/gm;
  const matches = Array.from(content.matchAll(featureRegex));

  for (const match of matches) {
    const featureNumber = parseInt(match[1], 10);
    const title = match[2].trim();
    const taskId = `${planId}#${featureNumber}`;

    // Extract status from content after the feature marker
    const featureStart = match.index || 0;
    const nextFeatureMatch = content.indexOf('### #', featureStart + 1);
    const featureSection =
      nextFeatureMatch > 0
        ? content.substring(featureStart, nextFeatureMatch)
        : content.substring(featureStart);

    // Extract status: Status: `GAP` or Status: `WIP`, etc.
    const statusMatch = featureSection.match(/Status:\s*`?(\w+)`?/i);
    const status = (statusMatch?.[1]?.toUpperCase() || 'GAP') as 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';

    // Extract dependencies
    const dependencies: string[] = [];
    const depsMatch = featureSection.match(/Dependencies:\s*(.+?)(?:\n|$)/i);
    if (depsMatch) {
      const depsText = depsMatch[1].trim();
      if (depsText && depsText.toLowerCase() !== 'none') {
        // Extract feature references like #1, #2, or full task IDs
        const depMatches = depsText.matchAll(/#(\d+)|(\d{4}[^#]*#\d+)/g);
        for (const depMatch of depMatches) {
          if (depMatch[1]) {
            dependencies.push(`#${depMatch[1]}`);
          } else if (depMatch[2]) {
            dependencies.push(depMatch[2]);
          }
        }
      }
    }

    // Extract files from Files: line
    const files: string[] = [];
    const filesMatch = featureSection.match(/Files:\s*(.+?)(?:\n|$)/i);
    if (filesMatch) {
      const filesText = filesMatch[1].trim();
      // Extract file paths (may be comma-separated or on multiple lines)
      const fileMatches = filesText.matchAll(/`?([^\s`,]+\.(?:ts|js|tsx|jsx|md|json))`?/g);
      for (const fileMatch of fileMatches) {
        if (fileMatch[1]) {
          files.push(fileMatch[1]);
        }
      }
    }

    // Extract agent persona if this is an agent file
    let agentPersona: 'coder' | 'reviewer' | 'pm' | 'customer' | undefined;
    if (path.includes('/agents/') || path.includes('\\agents\\')) {
      // Try to extract from agent file content
      const personaMatch = content.match(/persona[:\s]+(coder|reviewer|pm|customer)/i);
      if (personaMatch) {
        agentPersona = personaMatch[1].toLowerCase() as 'coder' | 'reviewer' | 'pm' | 'customer';
      }
    }

    tasks.push({
      id: taskId,
      planId,
      featureNumber,
      title,
      status,
      dependencies,
      files,
      documentPath: path,
      agentPersona,
    });
  }

  return tasks;
}

/**
 * Find a specific task in parsed tasks by ID.
 *
 * @param tasks - Array of parsed tasks
 * @param taskId - Task ID to find
 * @returns Parsed task or undefined if not found
 */
export function findTaskById(tasks: ParsedTask[], taskId: string): ParsedTask | undefined {
  return tasks.find((t) => t.id === taskId);
}
