/**
 * Aggregate health check: staleness + inference + optional drift.
 * Used by `limps health check` to produce a single summary.
 */

import type { ServerConfig } from '../config.js';
import { getStalenessReport, listPlanDirectories } from './health-staleness.js';
import { findPlanDirectory } from './list-agents.js';
import { inferStatus } from './health-inference.js';
import { checkFileDrift } from './health-drift.js';

export interface HealthCheckResult {
  staleness: ReturnType<typeof getStalenessReport>;
  inference: {
    plansChecked: number;
    suggestionsCount: number;
    suggestionsByPlan: { planId: string; count: number }[];
  };
  drift?: {
    plansChecked: number;
    driftCount: number;
    driftsByPlan: { planId: string; count: number }[];
  };
  summary: {
    staleCount: number;
    inferenceSuggestions: number;
    driftCount: number;
  };
}

/**
 * Optional hook called after a health check completes.
 * Used for future integrations (e.g. Slack/Discord notifications).
 */
export type HealthCheckHook = (result: HealthCheckResult) => void;

/**
 * Run staleness, inference, and optionally drift for the given scope.
 * Calls onComplete hook if provided (e.g. for notifications).
 */
export function runHealthCheck(
  config: ServerConfig,
  options: { planId?: string; codebasePath?: string; onComplete?: HealthCheckHook } = {}
): HealthCheckResult {
  const staleness = getStalenessReport(config, { planId: options.planId });
  const codebasePath = options.codebasePath ?? config.health?.drift?.codebasePath;

  let planIds: string[];
  if (options.planId) {
    const dir = findPlanDirectory(config.plansPath, options.planId);
    const planName = dir ? dir.split(/[/\\]/).pop() : null;
    planIds = planName ? [planName] : [];
  } else {
    planIds = listPlanDirectories(config.plansPath);
  }

  const inferenceByPlan: { planId: string; count: number }[] = [];
  let totalInference = 0;
  for (const planId of planIds) {
    const result = inferStatus(config, planId);
    if (!result.error) {
      inferenceByPlan.push({ planId, count: result.suggestions.length });
      totalInference += result.suggestions.length;
    }
  }

  let driftCount = 0;
  const driftsByPlan: { planId: string; count: number }[] = [];
  if (codebasePath) {
    for (const planId of planIds) {
      const result = checkFileDrift(config, planId, codebasePath);
      if (!result.error) {
        driftsByPlan.push({ planId, count: result.drifts.length });
        driftCount += result.drifts.length;
      }
    }
  }

  const result: HealthCheckResult = {
    staleness,
    inference: {
      plansChecked: planIds.length,
      suggestionsCount: totalInference,
      suggestionsByPlan: inferenceByPlan,
    },
    ...(codebasePath && {
      drift: {
        plansChecked: planIds.length,
        driftCount,
        driftsByPlan,
      },
    }),
    summary: {
      staleCount: staleness.stale.length,
      inferenceSuggestions: totalInference,
      driftCount: driftCount,
    },
  };

  options.onComplete?.(result);
  return result;
}

/**
 * Human-readable summary line for health check result.
 */
export function renderHealthCheckSummary(result: HealthCheckResult): string {
  const lines: string[] = [
    `Health: ${result.summary.staleCount} stale, ${result.summary.inferenceSuggestions} status suggestions, ${result.summary.driftCount} drift`,
  ];
  if (result.summary.staleCount > 0) {
    lines.push(`  Stale: ${result.staleness.stale.map((s) => s.path).join(', ')}`);
  }
  if (result.summary.inferenceSuggestions > 0) {
    const byPlan = result.inference.suggestionsByPlan
      .filter((p) => p.count > 0)
      .map((p) => `${p.planId}(${p.count})`)
      .join(', ');
    lines.push(`  Inference: ${byPlan}`);
  }
  if (result.drift && result.summary.driftCount > 0) {
    const byPlan = result.drift.driftsByPlan
      .filter((p) => p.count > 0)
      .map((p) => `${p.planId}(${p.count})`)
      .join(', ');
    lines.push(`  Drift: ${byPlan}`);
  }
  return lines.join('\n');
}
