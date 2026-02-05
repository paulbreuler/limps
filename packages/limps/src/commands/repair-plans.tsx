import { Text } from 'ink';
import { useEffect } from 'react';
import { z } from 'zod';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { type ServerConfig, loadConfig } from '../config.js';
import { resolveConfigPath, resolveProjectConfigPath } from '../utils/config-resolver.js';
import {
  repairPlanFrontmatter,
  inspectPlanFrontmatter,
  inspectAgentFrontmatter,
  repairAgentFrontmatter,
} from '../cli/plan-repair.js';
import { isJsonMode, outputJson, wrapSuccess, wrapError } from '../cli/json-output.js';

export const description = 'Repair malformed plan frontmatter (priority/severity)';

export const args = z.tuple([z.string().describe('plan id or name').optional()]);

export const options = z.object({
  config: z.string().optional().describe('Path to config file'),
  project: z.string().optional().describe('Registered project name'),
  check: z.boolean().optional().describe('Report issues without modifying files'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  args: z.infer<typeof args>;
  options: z.infer<typeof options>;
}

function findPlanDirs(plansPath: string): string[] {
  if (!existsSync(plansPath)) {
    return [];
  }
  const entries = readdirSync(plansPath, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => name !== 'Completed' && !name.startsWith('_'));
}

function findAgentFiles(planDirPath: string): string[] {
  const agentsDir = join(planDirPath, 'agents');
  if (!existsSync(agentsDir)) {
    return [];
  }
  return readdirSync(agentsDir)
    .filter((name) => name.endsWith('.agent.md'))
    .map((name) => join(agentsDir, name));
}

export default function RepairPlansCommand({ args, options }: Props): React.ReactNode {
  const [planId] = args;
  const jsonMode = isJsonMode(options);

  const getConfig = (): ServerConfig => {
    const configPath = options.project
      ? resolveProjectConfigPath(options.project)
      : resolveConfigPath(options.config);
    return loadConfig(configPath);
  };

  const getPlanDirs = (plansPath: string): string[] =>
    planId
      ? findPlanDirs(plansPath).filter(
          (dir) =>
            dir.startsWith(planId.padStart(4, '0')) ||
            dir.startsWith(`${planId}-`) ||
            dir === planId
        )
      : findPlanDirs(plansPath);

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return;
    }
    const timer = setTimeout(() => {
      try {
        const config = getConfig();
        const planDirs = getPlanDirs(config.plansPath);
        if (planDirs.length === 0) {
          outputJson(wrapError('No matching plans found.', { code: 'REPAIR_PLANS_ERROR' }), 1);
        }
        const issues: {
          plan: string;
          path: string;
          status: string;
          issues: { code: string; message: string; value?: string }[];
          priority?: string;
          severity?: string;
          priorityRaw?: string;
          severityRaw?: string;
        }[] = [];

        for (const dir of planDirs) {
          const planFilePath = join(config.plansPath, dir, `${dir}-plan.md`);
          const content = existsSync(planFilePath) ? readFileSync(planFilePath, 'utf-8') : '';
          const inspection = inspectPlanFrontmatter(content);
          if (inspection.status === 'needs_repair') {
            issues.push({
              plan: dir,
              path: planFilePath,
              status: inspection.status,
              issues: inspection.issues,
              priority: inspection.priority,
              severity: inspection.severity,
              priorityRaw: inspection.priorityRaw,
              severityRaw: inspection.severityRaw,
            });
          }
        }

        const agentIssues: {
          plan: string;
          agent: string;
          badKeys: string[];
          issues: { key: string; message: string }[];
        }[] = [];

        for (const dir of planDirs) {
          const planDirPath = join(config.plansPath, dir);
          for (const agentPath of findAgentFiles(planDirPath)) {
            const content = readFileSync(agentPath, 'utf-8');
            const inspection = inspectAgentFrontmatter(content);
            if (inspection.status === 'needs_repair') {
              agentIssues.push({
                plan: dir,
                agent: agentPath,
                badKeys: inspection.badKeys,
                issues: inspection.issues,
              });
            }
          }
        }

        outputJson(
          wrapSuccess({
            total: issues.length,
            issues,
            agents: agentIssues,
            agentsTotal: agentIssues.length,
          })
        );
      } catch (error) {
        outputJson(
          wrapError(error instanceof Error ? error.message : String(error), {
            code: 'REPAIR_PLANS_ERROR',
          }),
          1
        );
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [jsonMode, options.config, options.project, planId]);

  if (jsonMode) {
    return null;
  }

  const config = getConfig();
  const planDirs = getPlanDirs(config.plansPath);

  if (planDirs.length === 0) {
    return <Text color="yellow">No matching plans found.</Text>;
  }

  if (options.check) {
    const issues: {
      plan: string;
      path: string;
      status: string;
      issues: { code: string; message: string; value?: string }[];
      priority?: string;
      severity?: string;
      priorityRaw?: string;
      severityRaw?: string;
    }[] = [];

    for (const dir of planDirs) {
      const planFilePath = join(config.plansPath, dir, `${dir}-plan.md`);
      const content = existsSync(planFilePath) ? readFileSync(planFilePath, 'utf-8') : '';
      const inspection = inspectPlanFrontmatter(content);
      if (inspection.status === 'needs_repair') {
        issues.push({
          plan: dir,
          path: planFilePath,
          status: inspection.status,
          issues: inspection.issues,
          priority: inspection.priority,
          severity: inspection.severity,
          priorityRaw: inspection.priorityRaw,
          severityRaw: inspection.severityRaw,
        });
      }
    }

    const brokenAgents: { plan: string; agent: string; badKeys: string[] }[] = [];
    for (const dir of planDirs) {
      const planDirPath = join(config.plansPath, dir);
      for (const agentPath of findAgentFiles(planDirPath)) {
        const content = readFileSync(agentPath, 'utf-8');
        const inspection = inspectAgentFrontmatter(content);
        if (inspection.status === 'needs_repair') {
          brokenAgents.push({ plan: dir, agent: agentPath, badKeys: inspection.badKeys });
        }
      }
    }

    if (issues.length === 0 && brokenAgents.length === 0) {
      return <Text color="green">No repairable plan or agent frontmatter issues found.</Text>;
    }

    const lines: string[] = [];
    if (issues.length > 0) {
      lines.push(`Found ${issues.length} plan(s) needing repair:`);
      for (const issue of issues) {
        lines.push(`  - ${issue.plan}: ${issue.path}`);
        for (const entry of issue.issues) {
          lines.push(
            `      ${entry.code}: ${entry.message}${entry.value ? ` (${entry.value})` : ''}`
          );
        }
      }
    }
    if (brokenAgents.length > 0) {
      lines.push(`Found ${brokenAgents.length} agent(s) with bad dependency keys:`);
      for (const entry of brokenAgents) {
        lines.push(`  - ${entry.plan}: ${entry.agent} [${entry.badKeys.join(', ')}]`);
      }
    }
    lines.push('');
    lines.push('Run `limps repair-plans` to apply fixes.');
    return <Text>{lines.join('\n')}</Text>;
  }

  const results: string[] = [];
  let repairedCount = 0;
  let skippedCount = 0;

  for (const dir of planDirs) {
    const planFilePath = join(config.plansPath, dir, `${dir}-plan.md`);
    const result = repairPlanFrontmatter(planFilePath);
    if (result.repaired) {
      repairedCount++;
      results.push(
        `  repaired: ${dir} (priority=${result.priority ?? 'n/a'}, severity=${result.severity ?? 'n/a'})`
      );
    } else {
      skippedCount++;
      results.push(`  skipped: ${dir} (${result.reason})`);
    }
  }

  let agentRepairedCount = 0;
  let agentSkippedCount = 0;

  for (const dir of planDirs) {
    const planDirPath = join(config.plansPath, dir);
    for (const agentPath of findAgentFiles(planDirPath)) {
      const result = repairAgentFrontmatter(agentPath);
      if (result.repaired) {
        agentRepairedCount++;
        results.push(`  repaired agent: ${agentPath} [${result.renamedKeys.join(', ')}]`);
      } else {
        agentSkippedCount++;
      }
    }
  }

  return (
    <Text>
      Repaired {repairedCount} plan(s), skipped {skippedCount}.{'\n'}
      Repaired {agentRepairedCount} agent(s), skipped {agentSkippedCount}.{'\n'}
      {results.join('\n')}
    </Text>
  );
}
