/**
 * Staleness detection utilities for plans and agents.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';
import type { ServerConfig } from '../config.js';
import { getStalenessConfig } from '../config.js';
import { findPlanDirectory, getAgentFiles } from './list-agents.js';
import { getPlanStatus } from './list-plans.js';
import { findPlanFile } from '../utils/paths.js';

export type StaleSeverity = 'warning' | 'critical';

export interface StaleEntry {
  type: 'agent' | 'plan';
  plan: string;
  path: string;
  lastModified: string;
  daysSinceUpdate: number;
  severity: StaleSeverity;
  status: string;
}

export interface StalenessReport {
  stale: StaleEntry[];
  summary: {
    total: number;
    warning: number;
    critical: number;
  };
  configUsed: {
    warningDays: number;
    criticalDays: number;
    wipWarningDays: number;
    gapWarningDays: number;
    planCriticalDays: number;
    excludeStatuses: string[];
  };
}

export interface StalenessOptions {
  planId?: string;
  thresholdDays?: number;
  includePass?: boolean;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const toDaysSince = (date: Date, now = new Date()): number => {
  const diff = now.getTime() - date.getTime();
  return Math.max(0, Math.floor(diff / MS_PER_DAY));
};

const toRelativePlanPath = (plansPath: string, absolutePath: string): string => {
  const relativePath = relative(plansPath, absolutePath).split('\\').join('/');
  return relativePath ? `plans/${relativePath}` : absolutePath;
};

const listPlanDirectories = (plansPath: string): string[] => {
  if (!existsSync(plansPath)) {
    return [];
  }
  return readdirSync(plansPath, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name)
    .filter((dirName) => Boolean(findPlanFile(join(plansPath, dirName))));
};

const resolvePlanDirectories = (config: ServerConfig, planId?: string): string[] => {
  if (planId) {
    const planDir = findPlanDirectory(config.plansPath, planId);
    if (!planDir) {
      throw new Error(`Plan not found: ${planId}`);
    }
    return [planDir];
  }
  return listPlanDirectories(config.plansPath).map((dirName) => join(config.plansPath, dirName));
};

const getPlanStatusFromFile = (planFilePath: string): string => {
  try {
    const content = readFileSync(planFilePath, 'utf-8');
    return getPlanStatus(content);
  } catch {
    return 'GAP';
  }
};

export function getStalenessReport(
  config: ServerConfig,
  options: StalenessOptions = {}
): StalenessReport {
  const stalenessConfig = getStalenessConfig(config);
  const thresholdOverride = options.thresholdDays;
  const configUsed = {
    warningDays: thresholdOverride ?? stalenessConfig.warningDays,
    criticalDays: stalenessConfig.criticalDays,
    wipWarningDays: thresholdOverride ?? stalenessConfig.wipWarningDays,
    gapWarningDays: thresholdOverride ?? stalenessConfig.gapWarningDays,
    planCriticalDays: stalenessConfig.planCriticalDays,
    excludeStatuses: [...stalenessConfig.excludeStatuses],
  };

  const excludeStatuses = new Set(configUsed.excludeStatuses.map((status) => status.toUpperCase()));
  if (options.includePass) {
    excludeStatuses.delete('PASS');
  }

  const stale: StaleEntry[] = [];
  const now = new Date();
  const planDirs = resolvePlanDirectories(config, options.planId);

  for (const planDir of planDirs) {
    const planName = planDir.split('/').pop() ?? planDir;
    const planFilePath = findPlanFile(planDir);
    const planStatus = planFilePath ? getPlanStatusFromFile(planFilePath) : 'GAP';

    if (planStatus && excludeStatuses.has(planStatus.toUpperCase())) {
      continue;
    }

    const agents = getAgentFiles(planDir);
    const agentAges: Date[] = [];

    for (const agent of agents) {
      agentAges.push(agent.mtime);

      const status = agent.frontmatter.status;
      if (excludeStatuses.has(status)) {
        continue;
      }

      const daysSinceUpdate = toDaysSince(agent.mtime, now);
      const warningDays =
        status === 'WIP'
          ? configUsed.wipWarningDays
          : status === 'GAP'
            ? configUsed.gapWarningDays
            : configUsed.warningDays;

      if (daysSinceUpdate < warningDays) {
        continue;
      }

      const severity: StaleSeverity =
        daysSinceUpdate >= configUsed.criticalDays ? 'critical' : 'warning';

      stale.push({
        type: 'agent',
        plan: planName,
        path: toRelativePlanPath(config.plansPath, agent.path),
        lastModified: agent.mtime.toISOString(),
        daysSinceUpdate,
        severity,
        status,
      });
    }

    if (planFilePath) {
      const lastActivity =
        agentAges.length > 0
          ? new Date(Math.max(...agentAges.map((date) => date.getTime())))
          : statSync(planFilePath).mtime;
      const daysSinceUpdate = toDaysSince(lastActivity, now);

      if (daysSinceUpdate >= configUsed.planCriticalDays) {
        stale.push({
          type: 'plan',
          plan: planName,
          path: toRelativePlanPath(config.plansPath, planFilePath),
          lastModified: lastActivity.toISOString(),
          daysSinceUpdate,
          severity: 'critical',
          status: planStatus,
        });
      }
    }
  }

  stale.sort((a, b) => {
    if (a.severity !== b.severity) {
      return a.severity === 'critical' ? -1 : 1;
    }
    return b.daysSinceUpdate - a.daysSinceUpdate;
  });

  const summary = stale.reduce(
    (acc, entry) => {
      acc.total += 1;
      if (entry.severity === 'critical') {
        acc.critical += 1;
      } else {
        acc.warning += 1;
      }
      return acc;
    },
    { total: 0, warning: 0, critical: 0 }
  );

  return {
    stale,
    summary,
    configUsed,
  };
}

export function renderStalenessReport(report: StalenessReport): string {
  if (report.stale.length === 0) {
    return 'No stale plans or agents found.';
  }

  const lines: string[] = [];
  lines.push('Staleness report:');
  lines.push('');

  for (const entry of report.stale) {
    const label = entry.severity === 'critical' ? 'CRITICAL' : 'WARNING';
    lines.push(
      `[${label}] ${entry.plan} ${entry.type} - ${entry.path} (${entry.daysSinceUpdate}d)`
    );
  }

  lines.push('');
  lines.push(
    `Summary: ${report.summary.total} total | ${report.summary.critical} critical | ${report.summary.warning} warning`
  );

  return lines.join('\n');
}
