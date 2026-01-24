import { z } from 'zod';
import { readFileSync, writeFileSync } from 'fs';
import type { Database as DatabaseType } from 'better-sqlite3';
import {
  readCoordination,
  writeCoordination,
  type CoordinationState,
  type TaskState,
} from '../coordination.js';
import { indexDocument } from '../indexer.js';
import { extractPlanId, parseTasksFromDocument, findTaskById } from '../task-parser.js';
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
async function findPlanDocument(
  db: DatabaseType,
  plansPath: string,
  planId: string
): Promise<string | null> {
  // Query database for plan documents
  // Match planId in path (could be "0001-plan-name" or just "0001")
  const plans = db
    .prepare(
      `
    SELECT path
    FROM documents
    WHERE path LIKE ?
    AND path LIKE '%/plan.md'
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
 * Try to auto-create a task entry from the plan document.
 * Returns the task state if found in the plan, null otherwise.
 *
 * @param taskId - Task identifier
 * @param context - Tool context
 * @returns Task state or null if not found
 */
async function tryAutoCreateTaskFromPlan(
  taskId: string,
  context: ToolContext
): Promise<TaskState | null> {
  const parsed = parseTaskId(taskId);
  if (!parsed) {
    return null;
  }

  const { planId } = parsed;
  const { plansPath } = context.config;

  // Query database for plan documents matching this plan ID
  const plans = context.db
    .prepare(
      `
    SELECT path, content
    FROM documents
    WHERE path LIKE ?
    AND path LIKE '%/plan.md'
  `
    )
    .all(`${plansPath}%${planId}%`) as { path: string; content: string }[];

  if (plans.length === 0) {
    return null;
  }

  // Find the plan document and parse tasks
  for (const plan of plans) {
    const extractedPlanId = extractPlanId(plan.path);
    if (!extractedPlanId || !extractedPlanId.includes(planId)) {
      continue;
    }

    const tasks = parseTasksFromDocument(plan.path, plan.content, extractedPlanId);
    const task = findTaskById(tasks, taskId);

    if (task) {
      // Create TaskState from parsed task
      return {
        status: task.status,
        claimedBy: undefined,
        dependencies: task.dependencies,
      };
    }
  }

  return null;
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
  const { plansPath, coordinationPath } = context.config;

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
  const documentPath = await findPlanDocument(context.db, plansPath, planId);
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

  // Read current coordination state
  const coordination = await readCoordination(coordinationPath);
  let task = coordination.tasks[taskId];

  // Auto-create task entry if found in plan but not in coordination
  if (!task) {
    const autoCreatedTask = await tryAutoCreateTaskFromPlan(taskId, context);
    if (!autoCreatedTask) {
      return {
        content: [
          {
            type: 'text',
            text: `Task ${taskId} not found in coordination state or plan documents`,
          },
        ],
        isError: true,
      };
    }

    // Add the auto-created task to coordination state
    coordination.tasks[taskId] = autoCreatedTask;
    task = autoCreatedTask;
  }

  // Validate status transition
  if (!isValidTransition(task.status, status)) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid status transition from ${task.status} to ${status}. Valid transitions: ${VALID_TRANSITIONS[task.status]?.join(', ') || 'none'}`,
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

  // Update status in section
  const updatedSection = updateStatusInSection(taskSection.section, status);

  // Replace section in document
  const updatedContent =
    content.substring(0, taskSection.start) + updatedSection + content.substring(taskSection.end);

  // Write updated document
  writeFileSync(documentPath, updatedContent, 'utf-8');

  // Update coordination state if agentId provided
  if (agentId) {
    const maxRetries = 5;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        const currentCoordination = await readCoordination(coordinationPath);
        const expectedVersion = currentCoordination.version;

        // Update task status and claim
        const updatedCoordination: CoordinationState = {
          ...currentCoordination,
          version: currentCoordination.version + 1,
          tasks: {
            ...currentCoordination.tasks,
            [taskId]: {
              ...currentCoordination.tasks[taskId],
              status: status as 'GAP' | 'WIP' | 'PASS' | 'BLOCKED',
              claimedBy: status === 'WIP' ? agentId : undefined,
            },
          },
        };

        await writeCoordination(coordinationPath, updatedCoordination, expectedVersion);
        break;
      } catch (error) {
        retries++;
        if (retries >= maxRetries) {
          return {
            content: [
              {
                type: 'text',
                text: `Failed to update coordination state after ${maxRetries} retries: ${error instanceof Error ? error.message : String(error)}`,
              },
            ],
            isError: true,
          };
        }
        // Wait a bit before retry
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
    }
  }

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
