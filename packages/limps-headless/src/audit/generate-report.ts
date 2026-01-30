/**
 * Generate audit report from precomputed analysis, diff, and update-check JSON.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import type {
  AuditReport,
  AuditIssue,
  ComponentInventory,
  ComponentMetadata,
  Contravention,
  IssuePriority,
  RunAuditOptions,
} from './types.js';
import type { RadixDiff, UpdateCheckResult } from '../differ/types.js';

const REPORT_VERSION = '1.0.0';
const GENERATED_BY = 'limps-headless';

/**
 * Serializable analysis result (propsInterface as plain object when read from JSON).
 */
interface SerializedAnalysisResult {
  component: string;
  filePath: string;
  recommendation: {
    primitive: string | null;
    package: string | null;
    confidence: number;
    action: 'ADOPT_RADIX' | 'CONSIDER_RADIX' | 'CUSTOM_OK';
    reason?: string;
  };
  matches: unknown[];
  analysis: unknown;
  isAmbiguous: boolean;
}

function readJsonFile<T>(filePath: string): T {
  const raw = fs.readFileSync(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Normalize analysis input to array of results.
 */
function normalizeAnalysisInput(
  data: SerializedAnalysisResult | { results: SerializedAnalysisResult[] }
): SerializedAnalysisResult[] {
  if (Array.isArray((data as { results?: SerializedAnalysisResult[] }).results)) {
    return (data as { results: SerializedAnalysisResult[] }).results;
  }
  return [data as SerializedAnalysisResult];
}

function normalizeInventoryInput(
  data: ComponentInventory | ComponentMetadata[]
): ComponentMetadata[] {
  if (Array.isArray(data)) {
    return data;
  }
  return Array.isArray(data.components) ? data.components : [];
}

/**
 * Derive issues from analysis results.
 */
function issuesFromAnalysis(results: SerializedAnalysisResult[]): AuditIssue[] {
  const issues: AuditIssue[] = [];
  let id = 0;
  for (const r of results) {
    const loc = r.filePath;
    const rec = r.recommendation;
    if (rec.action === 'CUSTOM_OK' && (rec.confidence > 0 || rec.reason)) {
      const priority: IssuePriority =
        rec.confidence >= 30 ? 'low' : rec.confidence >= 10 ? 'medium' : 'high';
      issues.push({
        id: `analysis-${++id}`,
        category: 'adoption',
        priority,
        description: rec.reason ?? 'No Radix primitive match',
        recommendation: 'Consider adopting a Radix primitive or document custom component.',
        location: loc,
      });
    } else if (rec.action === 'CONSIDER_RADIX' && rec.confidence < 70) {
      issues.push({
        id: `analysis-${++id}`,
        category: 'adoption',
        priority: 'medium',
        description: rec.reason ?? `Moderate match to ${rec.primitive}`,
        recommendation: `Review and consider adopting @radix-ui/react-${rec.primitive?.toLowerCase() ?? 'primitive'}.`,
        location: loc,
      });
    }
  }
  return issues;
}

/**
 * Build per-component compliance summary from analysis results.
 */
function complianceFromAnalysis(
  results: SerializedAnalysisResult[]
): NonNullable<AuditReport['compliance']> {
  return results.map((r) => {
    let status: 'pass' | 'partial' | 'fail';
    if (r.recommendation.action === 'ADOPT_RADIX') {
      status = 'pass';
    } else if (r.recommendation.action === 'CONSIDER_RADIX') {
      status = 'partial';
    } else {
      status = 'fail';
    }
    return {
      path: r.filePath,
      name: r.component,
      primitive: r.recommendation.primitive,
      confidence: r.recommendation.confidence,
      status,
    };
  });
}

/**
 * Derive contraventions from diff and update-check.
 */
function contraventionsFromDiffAndUpdates(
  diff: RadixDiff | null,
  updates: UpdateCheckResult | null
): Contravention[] {
  const out: Contravention[] = [];
  // Single contravention when behind latest and diff has breaking changes (avoid duplicate)
  if (updates?.hasUpdate && updates.diff?.hasBreakingChanges) {
    out.push({
      id: 'contravention-legacy-version',
      type: 'legacy-package-usage',
      severity: 'high',
      description: `Current cached version ${updates.currentVersion} is behind latest ${updates.latestVersion}. ${updates.diff.summary.breaking} breaking change(s) exist.`,
      recommendation: 'Upgrade Radix dependencies and run headless_diff_versions to plan migration.',
    });
    return out;
  }
  if (diff?.hasBreakingChanges && diff.summary.breaking > 0) {
    out.push({
      id: 'contravention-breaking-changes',
      type: 'version-drift',
      severity: 'high',
      description: `${diff.summary.breaking} breaking change(s) between ${diff.fromVersion} and ${diff.toVersion}.`,
      recommendation: 'Review diff and update usages before upgrading.',
    });
  }
  return out;
}

/**
 * Build summary counts from issues and contraventions.
 */
function buildSummary(
  totalComponents: number,
  issues: AuditIssue[],
  contraventions: Contravention[]
): AuditReport['summary'] {
  const issuesByPriority: Record<IssuePriority, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };
  for (const i of issues) {
    issuesByPriority[i.priority]++;
  }
  return {
    totalComponents,
    issuesByPriority,
    contraventions: contraventions.length,
  };
}

/**
 * Build top-level recommendations list.
 */
function buildRecommendations(issues: AuditIssue[], contraventions: Contravention[]): string[] {
  const recs = new Set<string>();
  for (const c of contraventions) {
    recs.add(c.recommendation);
  }
  for (const i of issues) {
    recs.add(i.recommendation);
  }
  return [...recs];
}

export interface GenerateReportInput {
  inputs: {
    analysis?: string;
    diff?: string;
    checkUpdates?: string;
    inventory?: string;
  };
  outputDir?: string;
  format?: 'json' | 'markdown' | 'both';
  title?: string;
  /** Policy options used for this audit (included in report metadata). */
  policy?: Partial<RunAuditOptions>;
}

export interface GenerateReportResult {
  report: AuditReport;
  outputDir: string;
  jsonPath?: string;
  markdownPath?: string;
}

/**
 * Generate audit report from precomputed input paths.
 */
export function generateReport(input: GenerateReportInput): GenerateReportResult {
  const outputDir = path.resolve(input.outputDir ?? '.limps-headless/reports');
  ensureDir(outputDir);

  let results: SerializedAnalysisResult[] = [];
  if (input.inputs.analysis) {
    const analysisData = readJsonFile<
      SerializedAnalysisResult | { results: SerializedAnalysisResult[] }
    >(path.resolve(input.inputs.analysis));
    results = normalizeAnalysisInput(analysisData);
  }

  let diff: RadixDiff | null = null;
  if (input.inputs.diff) {
    diff = readJsonFile<RadixDiff>(path.resolve(input.inputs.diff));
  }

  let updates: UpdateCheckResult | null = null;
  if (input.inputs.checkUpdates) {
    updates = readJsonFile<UpdateCheckResult>(path.resolve(input.inputs.checkUpdates));
  }

  let inventory: ComponentMetadata[] | undefined;
  if (input.inputs.inventory) {
    const inventoryData = readJsonFile<ComponentInventory | ComponentMetadata[]>(
      path.resolve(input.inputs.inventory)
    );
    inventory = normalizeInventoryInput(inventoryData);
  }

  const issues = issuesFromAnalysis(results);
  const contraventions = contraventionsFromDiffAndUpdates(diff, updates);
  const summary = buildSummary(results.length, issues, contraventions);
  const recommendations = buildRecommendations(issues, contraventions);
  const compliance = complianceFromAnalysis(results);

  const report: AuditReport = {
    metadata: {
      version: REPORT_VERSION,
      generatedAt: new Date().toISOString(),
      generatedBy: GENERATED_BY,
      ...(input.policy && Object.keys(input.policy).length > 0 && { policy: input.policy }),
    },
    summary,
    inventory,
    compliance,
    contraventions,
    issues,
    recommendations,
  };

  const title = input.title ?? 'Radix Audit Report';
  let jsonPath: string | undefined;
  let markdownPath: string | undefined;

  const format = input.format ?? 'both';
  if (format === 'json' || format === 'both') {
    jsonPath = path.join(outputDir, 'audit-report.json');
    fs.writeFileSync(jsonPath, JSON.stringify(report, null, 2), 'utf-8');
  }
  if (format === 'markdown' || format === 'both') {
    markdownPath = path.join(outputDir, 'audit-report.md');
    fs.writeFileSync(markdownPath, reportToMarkdown(report, title), 'utf-8');
  }

  return { report, outputDir, jsonPath, markdownPath };
}

/**
 * Render report as Markdown.
 */
function reportToMarkdown(report: AuditReport, title: string): string {
  const lines: string[] = [
    `# ${title}`,
    '',
    `*Generated ${report.metadata.generatedAt} by ${report.metadata.generatedBy}*`,
    '',
    '## Summary',
    '',
    `- **Components audited:** ${report.summary.totalComponents}`,
    `- **Issues:** critical ${report.summary.issuesByPriority.critical}, high ${report.summary.issuesByPriority.high}, medium ${report.summary.issuesByPriority.medium}, low ${report.summary.issuesByPriority.low}`,
    `- **Contraventions:** ${report.summary.contraventions}`,
    '',
  ];

  if (report.contraventions.length > 0) {
    lines.push('## Contraventions', '');
    for (const c of report.contraventions) {
      lines.push(`### ${c.type} (${c.severity})`, '');
      lines.push(c.description, '');
      lines.push(`**Recommendation:** ${c.recommendation}`, '');
      if (c.location) lines.push(`*Location:* ${c.location}`, '');
      lines.push('');
    }
  }

  if (report.compliance && report.compliance.length > 0) {
    lines.push('## Compliance', '');
    for (const c of report.compliance) {
      const primitive = c.primitive ? c.primitive : 'custom';
      lines.push(
        `- **${c.name}** (${c.path}) — ${c.status}, ${primitive} (${c.confidence})`
      );
    }
    lines.push('');
  }

  if (report.inventory && report.inventory.length > 0) {
    lines.push('## Components', '');
    for (const c of report.inventory) {
      const deps = c.dependencies && c.dependencies.length > 0 ? c.dependencies.join(', ') : 'none';
      const props = c.propsInterface ? `props: ${c.propsInterface}` : 'props: unknown';
      const exportType = c.exportType ?? 'export: unknown';
      lines.push(`- **${c.name}** (${c.path}) — ${exportType}, ${props}, deps: ${deps}`);
    }
    lines.push('');
  }

  if (report.issues.length > 0) {
    lines.push('## Issues', '');
    for (const i of report.issues) {
      lines.push(`### ${i.id} — ${i.category} (${i.priority})`, '');
      lines.push(i.description, '');
      lines.push(`**Recommendation:** ${i.recommendation}`, '');
      if (i.location) lines.push(`*Location:* ${i.location}`, '');
      lines.push('');
    }
  }

  if (report.recommendations.length > 0) {
    lines.push('## Recommendations', '');
    for (const r of report.recommendations) {
      lines.push(`- ${r}`, '');
    }
  }

  return lines.join('\n');
}
