import { existsSync, readFileSync, writeFileSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { FrontmatterHandler } from '../utils/frontmatter.js';

type PlanSignal = 'low' | 'medium' | 'high' | 'critical';

const frontmatterHandler = new FrontmatterHandler();

const normalizePlanSignal = (value: unknown): PlanSignal | undefined => {
  if (typeof value !== 'string') {
    return undefined;
  }
  const normalized = value.trim().toLowerCase();
  if (
    normalized === 'low' ||
    normalized === 'medium' ||
    normalized === 'high' ||
    normalized === 'critical'
  ) {
    return normalized;
  }
  return undefined;
};

const stripFrontmatter = (content: string): string => {
  if (!content.startsWith('---')) {
    return content;
  }
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return content;
  }
  return content.slice(endIndex + 4).trim();
};

const extractPrioritySeverity = (
  content: string
): {
  priority?: PlanSignal;
  severity?: PlanSignal;
} => {
  const priorityMatch = content.match(/^\s*priority\s*:\s*(.+)\s*$/im);
  const severityMatch = content.match(/^\s*severity\s*:\s*(.+)\s*$/im);
  return {
    priority: normalizePlanSignal(priorityMatch?.[1]),
    severity: normalizePlanSignal(severityMatch?.[1]),
  };
};

const extractFrontmatterBlock = (content: string): { yaml: string; body: string } | null => {
  if (!content.startsWith('---')) {
    return null;
  }
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex === -1) {
    return null;
  }
  return {
    yaml: content.slice(4, endIndex),
    body: content.slice(endIndex + 4).trim(),
  };
};

export interface PlanFrontmatterIssue {
  code: 'missing_frontmatter' | 'malformed_frontmatter' | 'invalid_priority' | 'invalid_severity';
  message: string;
  value?: string;
}

export interface PlanFrontmatterInspection {
  status: 'valid' | 'needs_repair' | 'no_signals' | 'missing';
  issues: PlanFrontmatterIssue[];
  priority?: PlanSignal;
  severity?: PlanSignal;
  priorityRaw?: string;
  severityRaw?: string;
}

export function inspectPlanFrontmatter(content: string): PlanFrontmatterInspection {
  const block = extractFrontmatterBlock(content);
  if (!block) {
    return {
      status: 'missing',
      issues: [
        {
          code: 'missing_frontmatter',
          message: 'No frontmatter block found.',
        },
      ],
    };
  }

  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = (parseYaml(block.yaml) as Record<string, unknown>) || {};
  } catch {
    return {
      status: 'needs_repair',
      issues: [
        {
          code: 'malformed_frontmatter',
          message: 'Frontmatter YAML is malformed.',
        },
      ],
    };
  }

  const priorityRaw = typeof parsed.priority === 'string' ? parsed.priority : undefined;
  const severityRaw = typeof parsed.severity === 'string' ? parsed.severity : undefined;
  const priority = normalizePlanSignal(priorityRaw);
  const severity = normalizePlanSignal(severityRaw);

  const issues: PlanFrontmatterIssue[] = [];
  if (priorityRaw && !priority) {
    issues.push({
      code: 'invalid_priority',
      message: 'Invalid priority value.',
      value: priorityRaw,
    });
  }
  if (severityRaw && !severity) {
    issues.push({
      code: 'invalid_severity',
      message: 'Invalid severity value.',
      value: severityRaw,
    });
  }

  if (!priority && !severity) {
    return {
      status: issues.length > 0 ? 'needs_repair' : 'no_signals',
      issues,
      priority,
      severity,
      priorityRaw,
      severityRaw,
    };
  }

  return {
    status: issues.length > 0 ? 'needs_repair' : 'valid',
    issues,
    priority,
    severity,
    priorityRaw,
    severityRaw,
  };
}

export type PlanRepairResult =
  | { repaired: true; priority?: PlanSignal; severity?: PlanSignal }
  | { repaired: false; reason: 'missing' | 'valid' | 'no-signals' };

export function repairPlanFrontmatter(planFilePath: string): PlanRepairResult {
  if (!existsSync(planFilePath)) {
    return { repaired: false, reason: 'missing' };
  }
  const content = readFileSync(planFilePath, 'utf-8');
  try {
    const parsed = frontmatterHandler.parse(content);
    const priority = normalizePlanSignal(parsed.frontmatter.priority);
    const severity = normalizePlanSignal(parsed.frontmatter.severity);
    if (priority || severity) {
      return { repaired: false, reason: 'valid' };
    }
  } catch {
    // Ignore parse errors and attempt repair below.
  }

  const { priority, severity } = extractPrioritySeverity(content);
  if (!priority && !severity) {
    return { repaired: false, reason: 'no-signals' };
  }

  const body = stripFrontmatter(content);
  const repairedFrontmatter: Record<string, string> = {};
  if (priority) repairedFrontmatter.priority = priority;
  if (severity) repairedFrontmatter.severity = severity;
  const repairedContent = frontmatterHandler.stringify(repairedFrontmatter, body);
  writeFileSync(planFilePath, repairedContent, 'utf-8');
  return { repaired: true, priority, severity };
}
