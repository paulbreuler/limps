import { z } from 'zod';
import {
  existsSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  readFileSync,
  renameSync,
  rmSync,
} from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { indexDocument } from '../indexer.js';
import type { ToolContext, ToolResult } from '../types.js';
import { toJsonText } from '../utils/tool-response.js';
import { sanitizePlanName } from '../utils/sanitize-input.js';
import { runHooks } from '../hooks/runner.js';

// ESM equivalent of __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Input schema for create_plan tool.
 */
export const CreatePlanInputSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  body: z.string().optional(),
  templateName: z
    .enum(['default', 'spec'])
    .default('default')
    .describe('Template to use (default: minimal 3-section plan; spec: 12-section specification)'),
  ifExists: z
    .enum(['return', 'fail'])
    .default('return')
    .describe(
      "What to do when a plan with this name already exists (default: 'return' existing plan info)"
    ),
});

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
 * Find the next available plan number by scanning existing plans.
 */
function findNextPlanNumber(plansPath: string): number {
  if (!existsSync(plansPath)) {
    return 1;
  }

  const dirs = readdirSync(plansPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const planNumbers: number[] = [];
  for (const dir of dirs) {
    const num = extractPlanNumber(dir);
    if (num !== null) {
      planNumbers.push(num);
    }
  }

  if (planNumbers.length === 0) {
    return 1;
  }

  const maxNum = Math.max(...planNumbers);
  return maxNum + 1;
}

/**
 * True if name already has a numeric prefix (e.g. 0042-foo or 1-foo).
 * Callers use name as-is for directory name when this is true to avoid double prefix.
 */
function hasNumberPrefix(name: string): boolean {
  return /^\d+-.+/.test(name);
}

/**
 * Check if a plan with the given name already exists.
 */
function planExists(plansPath: string, name: string): boolean {
  if (!existsSync(plansPath)) {
    return false;
  }

  const dirs = readdirSync(plansPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

  const normalizedName = name.toLowerCase();
  // Exact directory name match (e.g. name "0042-limps-headless-pivot" matches dir "0042-limps-headless-pivot")
  if (dirs.some((dir) => dir.toLowerCase() === normalizedName)) {
    return true;
  }
  // Match by name part after number prefix (e.g. name "my-plan" matches dir "0001-my-plan")
  return dirs.some((dir) => {
    const dirName = dir.toLowerCase();
    const nameMatch = dirName.match(/^\d+-(.+)$/);
    if (nameMatch) {
      return nameMatch[1] === normalizedName;
    }
    return false;
  });
}

/**
 * Load template file and replace placeholders.
 */
function loadTemplate(
  planNumber: number,
  name: string,
  description?: string,
  body?: string,
  bodyProvided = false,
  templateName: 'default' | 'spec' = 'default'
): string {
  // Template file resolution: named templates take priority, then plan.md fallback
  const templateFileName = templateName === 'spec' ? 'spec.md' : 'plan.md';
  const possibleTemplatePaths = [
    join(process.cwd(), 'templates', templateFileName),
    join(__dirname, '..', '..', 'templates', templateFileName),
    // For 'default' also try plan.md if spec.md not found
    ...(templateName === 'default'
      ? [
          join(process.cwd(), 'templates', 'plan.md'),
          join(__dirname, '..', '..', 'templates', 'plan.md'),
        ]
      : []),
  ];

  let templateContent = '';
  let selectedTemplatePath: string | null = null;
  for (const templatePath of possibleTemplatePaths) {
    if (existsSync(templatePath)) {
      templateContent = readFileSync(templatePath, 'utf-8');
      selectedTemplatePath = templatePath;
      break;
    }
  }

  // Default template if none found
  if (!templateContent) {
    templateContent = `# ${name}

## Overview

${description || 'Plan description goes here'}

## Features

{{BODY}}

## Status

Status: Planning
`;
  }

  const trimmedBody = body?.trim();
  const hasBodyPlaceholder = templateContent.includes('{{BODY}}');

  if (bodyProvided && !hasBodyPlaceholder) {
    throw new Error(
      `Template must include {{BODY}} placeholder when body is provided${selectedTemplatePath ? ` (${selectedTemplatePath})` : ''}`
    );
  }

  const bodyContent = trimmedBody || '<!-- Features will be added here -->';

  // Replace placeholders
  templateContent = templateContent
    .replace(/\{\{PLAN_NAME\}\}/g, name)
    .replace(/\{\{PLAN_NUMBER\}\}/g, planNumber.toString().padStart(4, '0'))
    .replace(/\{\{DESCRIPTION\}\}/g, description || '')
    .replace(/\{\{BODY\}\}/g, bodyContent);

  return templateContent;
}

/**
 * Handle create_plan tool request.
 * Creates a new planning document from template with zero-padded ordering.
 *
 * @param input - Tool input
 * @param context - Tool context
 * @returns Tool result
 */
export async function handleCreatePlan(
  input: z.infer<typeof CreatePlanInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { name, description, body, templateName = 'default', ifExists = 'return' } = input;
  const bodyProvided = Object.prototype.hasOwnProperty.call(input, 'body');
  const { plansPath } = context.config;

  // Sanitize name: reject null bytes, path-traversal, and overly long inputs
  try {
    sanitizePlanName(name);
  } catch (err) {
    return {
      content: [
        {
          type: 'text',
          text: `Invalid plan name: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      isError: true,
    };
  }

  // Check if plan already exists
  if (planExists(plansPath, name)) {
    if (ifExists === 'fail') {
      return {
        content: [
          {
            type: 'text',
            text: `Plan with name "${name}" already exists`,
          },
        ],
        isError: true,
      };
    }

    // ifExists === 'return': return existing plan info as a success
    const existingDirName = hasNumberPrefix(name) ? name : name;
    const existingDir = join(plansPath, existingDirName);
    return {
      content: [
        {
          type: 'text',
          text: toJsonText({ plan: name, planDir: existingDir, alreadyExists: true }, [
            {
              tool: 'list_agents',
              reason: 'View existing agents for this plan',
              params: { planId: name },
            },
            {
              tool: 'get_next_task',
              reason: 'Get the next available task in this plan',
              params: { planId: name },
            },
          ]),
        },
      ],
    };
  }

  // Use name as-is when it already has a number prefix (e.g. 0042-limps-headless-pivot) to avoid double prefix
  const planDirName = hasNumberPrefix(name)
    ? name
    : `${findNextPlanNumber(plansPath).toString().padStart(4, '0')}-${name}`;
  const planNumber = extractPlanNumber(planDirName) ?? findNextPlanNumber(plansPath);
  const planDir = join(plansPath, planDirName);
  const tempDir = `${planDir}.tmp`;

  try {
    // Create plan directory atomically (create temp, then rename)
    mkdirSync(tempDir, { recursive: true });

    // Create plan file with descriptive name (e.g., 0004-integration-tests-plan.md)
    const planFileName = `${planDirName}-plan.md`;
    const planContent = loadTemplate(
      planNumber,
      planDirName,
      description,
      body,
      bodyProvided,
      templateName
    );
    const tempPlanFilePath = join(tempDir, planFileName);
    writeFileSync(tempPlanFilePath, planContent, 'utf-8');

    // Atomic rename
    renameSync(tempDir, planDir);

    // Index the new document (use final path after rename)
    const planFilePath = join(planDir, planFileName);
    await indexDocument(context.db, planFilePath);

    // Fire plan:created hook (non-blocking)
    void runHooks(
      'plan:created',
      { plan: planDirName, planDir, planFile: planFilePath },
      context.config.hooksPath
    );

    return {
      content: [
        {
          type: 'text',
          text: toJsonText({ plan: planDirName, planDir, created: true }, [
            {
              tool: 'list_agents',
              reason: 'Add agent task files to the new plan',
              params: { planId: planDirName },
            },
            {
              tool: 'get_next_task',
              reason: 'Get the first available task once agents are added',
              params: { planId: planDirName },
            },
          ]),
        },
      ],
    };
  } catch (error) {
    // Clean up on error
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (existsSync(planDir)) {
      rmSync(planDir, { recursive: true, force: true });
    }

    return {
      content: [
        {
          type: 'text',
          text: `Failed to create plan: ${error instanceof Error ? error.message : String(error)}`,
        },
      ],
      isError: true,
    };
  }
}
