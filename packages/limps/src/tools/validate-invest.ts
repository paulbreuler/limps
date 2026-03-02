import { z } from 'zod';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import matter from 'gray-matter';
import { validateInvest } from '../utils/invest.js';
import type { ToolContext, ToolResult } from '../types.js';

export const ValidateInvestInputSchema = z.object({
  taskId: z
    .string()
    .min(1)
    .describe('Task ID in format "planFolder#agentNumber" (e.g., "0001-feature-name#002")'),
});

export async function validateInvestHandler(
  args: z.infer<typeof ValidateInvestInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { config } = context;
  const plansPath = config.workspacePath ?? config.plansPath;

  const taskId = args.taskId;

  // Parse taskId: "0001-sprint-42#002" -> plan dir "0001-sprint-42", agent num "002"
  const match = /^(.+?)#(\d+)$/.exec(taskId);
  let filePath: string | null = null;

  if (match) {
    const [, planPrefix, agentNum] = match;
    const agentsDir = join(plansPath, planPrefix, 'agents');

    if (existsSync(agentsDir)) {
      const files = readdirSync(agentsDir);
      const agentFile = files.find((f) => f.startsWith(agentNum));
      if (agentFile) {
        filePath = join(agentsDir, agentFile);
      }
    }
  }

  if (!filePath || !existsSync(filePath)) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ error: `Task file not found for taskId: ${taskId}` }),
        },
      ],
    };
  }

  const content = readFileSync(filePath, 'utf-8');
  const { data: frontmatter, content: body } = matter(content);

  const report = validateInvest(frontmatter as Record<string, unknown>, body);

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ taskId, ...report }, null, 2),
      },
    ],
  };
}
