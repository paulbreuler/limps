import { z } from 'zod';
import { readFileSync, writeFileSync } from 'fs';
import type { Database as DatabaseType } from 'better-sqlite3';
import { indexDocument } from '../indexer.js';
import type { ToolContext, ToolResult } from '../types.js';

/**
 * Input schema for update_task_status tool.
 */
export const UpdateTaskStatusInputSchema = z.object({
  taskId: z.string(),
  status: z.enum(['GAP', 'WIP', 'PASS', 'BLOCKED']),
  agentId: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * Valid status transitions.
 */
const VALID_TRANSITIONS: Record<string, string[]> = {
  GAP: ['WIP'],
  WIP: ['PASS', 'BLOCKED'],
  PASS: [], // Terminal state
  BLOCKED: ['GAP', 'WIP'], // Can be unblocked
};

/**
 * Check if a status transition is valid.
 */
function isValidTransition(from: string, to: string): boolean {
  const allowed = VALID_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/**
 * Find task in document by feature number.
 * Returns the content section for the task.
 */
function findTaskSection(
  content: string,
  featureNumber: number
): {
  start: number;
  end: number;
  section: string;
} | null {
  const featureRegex = new RegExp(`^###\\s+#${featureNumber}:`, 'm');
  const match = content.match(featureRegex);

  if (!match || match.index === undefined) {
    return null;
  }

  const start = match.index;
  // Find next feature or end of document
  const nextFeatureMatch = content.indexOf('### #', start + 1);
  const end = nextFeatureMatch > 0 ? nextFeatureMatch : content.length;
  const section = content.substring(start, end);

  return { start, end, section };
}

/**
 * Extract current status from a task section.
 */
function extractStatusFromSection(section: string): string | null {
  const statusRegex = /Status:\s*`?(\w+)`?/i;
  const match = section.match(statusRegex);
  return match ? match[1].toUpperCase() : null;
}

/**
 * Update status in task section.
 * Preserves formatting and other content.
 */
function updateStatusInSection(section: string, newStatus: string): string {
  // Match status line: "Status: `GAP`" or "Status: `WIP`" etc.
  const statusRegex = /Status:\s*`?(\w+)`?/i;
  const match = section.match(statusRegex);

  if (match) {
    // Replace existing status
    return section.replace(statusRegex, `Status: \`${newStatus}\``);
  } else {
    // Add status line if not found (shouldn't happen, but handle gracefully)
    // Insert after feature title
    const titleMatch = section.match(/^###\s+#\d+:\s+(.+)$/m);
    if (titleMatch) {
      const titleEnd = section.indexOf('\n', titleMatch.index || 0);
      return (
        section.substring(0, titleEnd + 1) +
        `\nStatus: \`${newStatus}\`\n` +
        section.substring(titleEnd + 1)
      );
    }
    return section;
  }
}

/**
 * Parse task ID to extract plan ID and feature number.
 * Format: "<planId>#<featureNumber>"
 */
function parseTaskId(taskId: string): { planId: string; featureNumber: number } | null {
  const match = taskId.match(/^(.+)#(\d+)$/);
  if (!match) {
    return null;
  }
  return {
    planId: match[1],
    featureNumber: parseInt(match[2], 10),
  };
}

/**
 * Find document path for a plan.
 */
function findPlanDocument(db: DatabaseType, plansPath: string, planId: string): string | null {
  // Query database for plan documents
  // Match planId in path (could be "0001-plan-name" or just "0001")
  const plans = db
    .prepare(
      `
    SELECT path
    FROM documents
    WHERE path LIKE ?
    AND (path LIKE '%-plan.md' OR path LIKE '%/plan.md')
  `
    )
    .all(`${plansPath}%${planId}%`) as { path: string }[];

  if (plans.length === 0) {
    return null;
  }

  // Find exact match (plan directory should contain planId)
  for (const plan of plans) {
    if (plan.path.includes(planId)) {
      return plan.path;
    }
  }

  return plans[0]?.path || null;
}

/**
 * Handle update_task_status tool request.
 * Updates task status in planning documents (GAP → WIP → PASS/BLOCKED).
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleUpdateTaskStatus(
  input: z.infer<typeof UpdateTaskStatusInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { taskId, status, agentId, notes } = input;
  const { plansPath } = context.config;

  // Parse task ID
  const parsed = parseTaskId(taskId);
  if (!parsed) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid task ID format: ${taskId}. Expected format: "<planId>#<featureNumber>"`,
        },
      ],
      isError: true,
    };
  }

  const { planId, featureNumber } = parsed;

  // Find plan document
  const documentPath = findPlanDocument(context.db, plansPath, planId);
  if (!documentPath) {
    return {
      content: [
        {
          type: 'text',
          text: `Plan document not found for task ${taskId}`,
        },
      ],
      isError: true,
    };
  }

  // Read document
  const content = readFileSync(documentPath, 'utf-8');

  // Find task section
  const taskSection = findTaskSection(content, featureNumber);
  if (!taskSection) {
    return {
      content: [
        {
          type: 'text',
          text: `Feature #${featureNumber} not found in document`,
        },
      ],
      isError: true,
    };
  }

  // Get current status from the document
  const currentStatus = extractStatusFromSection(taskSection.section);
  if (!currentStatus) {
    return {
      content: [
        {
          type: 'text',
          text: `Could not determine current status for task ${taskId}`,
        },
      ],
      isError: true,
    };
  }

  // Validate status transition
  if (!isValidTransition(currentStatus, status)) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid status transition from ${currentStatus} to ${status}. Valid transitions: ${VALID_TRANSITIONS[currentStatus]?.join(', ') || 'none'}`,
        },
      ],
      isError: true,
    };
  }

  // Update status in section
  const updatedSection = updateStatusInSection(taskSection.section, status);

  // Replace section in document
  const updatedContent =
    content.substring(0, taskSection.start) + updatedSection + content.substring(taskSection.end);

  // Write updated document
  writeFileSync(documentPath, updatedContent, 'utf-8');

  // Re-index document
  await indexDocument(context.db, documentPath);

  return {
    content: [
      {
        type: 'text',
        text: `Task ${taskId} status updated to ${status}${agentId ? ` by agent ${agentId}` : ''}${notes ? `. Notes: ${notes}` : ''}`,
      },
    ],
  };
}
