/**
 * Update proposals: generate from health checks and apply with confirmation.
 *
 * Proposals are generated on-demand from staleness, drift, and inference.
 * IDs are deterministic so apply_proposal can regenerate and find by id.
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join } from 'path';
import type { ServerConfig } from '../config.js';
import { getStalenessReport } from './health-staleness.js';
import { checkFileDrift } from './health-drift.js';
import { inferStatus } from './health-inference.js';
import { findPlanDirectory } from './list-agents.js';
import { listPlanDirectories } from './health-staleness.js';
import { FrontmatterHandler } from '../utils/frontmatter.js';
import { isSafeCodebasePath } from '../utils/paths.js';

/** Proposal type for categorization and filtering. */
export type UpdateProposalType = 'frontmatter' | 'status' | 'content' | 'file_list';

/**
 * A single update proposal (human review before applying).
 */
export interface UpdateProposal {
  id: string;
  type: UpdateProposalType;
  target: string;
  field?: string;
  currentValue: unknown;
  proposedValue: unknown;
  reason: string;
  confidence: number;
  autoApplyable: boolean;
  /** Plan id (folder name) for lookup when applying */
  planId: string;
}

export interface GetProposalsOptions {
  planId?: string;
  types?: UpdateProposalType[];
  minConfidence?: number;
  autoApplyableOnly?: boolean;
  /** Required for drift-based proposals */
  codebasePath?: string;
}

export interface GetProposalsResult {
  proposals: UpdateProposal[];
  error?: string;
}

/**
 * Generate a short deterministic id for a proposal.
 */
function proposalId(
  planId: string,
  type: string,
  target: string,
  field: string | undefined,
  current: unknown,
  proposed: unknown
): string {
  const payload = `${planId}:${type}:${target}:${field ?? ''}:${String(current)}:${String(proposed)}`;
  const hash = createHash('sha256').update(payload).digest('hex').slice(0, 12);
  return `proposal_${planId}_${hash}`;
}

/**
 * Resolve plan directories to scan (one plan or all).
 */
function resolvePlanDirs(config: ServerConfig, planId?: string): { dir: string; planId: string }[] {
  const plansPath = config.plansPath;
  if (planId) {
    const dir = findPlanDirectory(plansPath, planId);
    if (!dir) return [];
    const name = dir.split(/[/\\]/).pop() ?? planId;
    return [{ dir, planId: name }];
  }
  const names = listPlanDirectories(plansPath);
  return names.map((name) => ({ dir: join(plansPath, name), planId: name }));
}

/**
 * Generate update proposals from staleness, drift, and inference.
 */
function extractPlanIdFromProposalId(id: string): string | null {
  const match = id.match(/^proposal_(.+)_[a-f0-9]{12}$/);
  return match ? match[1] : null;
}

function resolveStaleEntryPath(plansPath: string, entryPath: string): string | null {
  const normalized = entryPath.replace(/\\/g, '/');
  if (!normalized.startsWith('plans/')) {
    return null;
  }
  const relPath = normalized.slice('plans/'.length);
  if (relPath.split('/').includes('..')) {
    return null;
  }
  return join(plansPath, relPath);
}

export function getProposals(
  config: ServerConfig,
  options: GetProposalsOptions = {}
): GetProposalsResult {
  const proposals: UpdateProposal[] = [];
  const minConfidence = options.minConfidence ?? 0;
  const typeSet = options.types ? new Set(options.types) : null;
  const autoOnly = options.autoApplyableOnly ?? false;

  if (options.codebasePath !== undefined && !isSafeCodebasePath(options.codebasePath)) {
    return {
      proposals: [],
      error: 'codebasePath must not contain ".." (path traversal not allowed)',
    };
  }

  const planDirs = resolvePlanDirs(config, options.planId);
  if (planDirs.length === 0 && options.planId) {
    return { proposals: [], error: `Plan not found: ${options.planId}` };
  }

  for (const { dir, planId } of planDirs) {
    const planName = dir.split(/[/\\]/).pop() ?? planId;

    // Status proposals from inference
    const inf = inferStatus(config, planName, { minConfidence });
    if (!inf.error && inf.suggestions.length > 0) {
      for (const s of inf.suggestions) {
        if (minConfidence > 0 && s.confidence < minConfidence) continue;
        if (typeSet && !typeSet.has('status')) continue;
        const autoApplyable = false; // status changes always require review
        if (autoOnly && !autoApplyable) continue;
        const id = proposalId(
          planName,
          'status',
          s.agentPath,
          'status',
          s.currentStatus,
          s.suggestedStatus
        );
        proposals.push({
          id,
          type: 'status',
          target: s.agentPath,
          field: 'status',
          currentValue: s.currentStatus,
          proposedValue: s.suggestedStatus,
          reason: s.reasons.join(' '),
          confidence: s.confidence,
          autoApplyable,
          planId: planName,
        });
      }
    }

    // Drift → file_list proposals (update files: in frontmatter)
    if (options.codebasePath) {
      const drift = checkFileDrift(config, planName, options.codebasePath);
      if (!drift.error && drift.drifts.length > 0) {
        for (const d of drift.drifts) {
          if (typeSet && !typeSet.has('file_list')) continue;
          const id = proposalId(
            planName,
            'file_list',
            d.agentPath,
            'files',
            d.listedFile,
            d.suggestion ?? 'remove'
          );
          proposals.push({
            id,
            type: 'file_list',
            target: d.agentPath,
            field: 'files',
            currentValue: d.listedFile,
            proposedValue: d.suggestion ?? null,
            reason: `File not found: ${d.listedFile}${d.suggestion ? `; suggest: ${d.suggestion}` : ''}`,
            confidence: d.suggestion ? 0.8 : 0.6,
            autoApplyable: false,
            planId: planName,
          });
        }
      }
    }

    // Staleness → frontmatter "updated" proposals (optional: propose bumping updated date)
    const staleness = getStalenessReport(config, { planId: planName });
    for (const entry of staleness.stale) {
      if (entry.type !== 'agent') continue;
      if (typeSet && !typeSet.has('frontmatter')) continue;
      // entry.path is like "plans/0033-limps-self-updating/agents/000_phase1.agent.md"
      const fullPath = resolveStaleEntryPath(config.plansPath, entry.path);
      if (!fullPath || !existsSync(fullPath)) continue;
      const proposedDate = new Date().toISOString().slice(0, 10);
      const id = proposalId(
        planName,
        'frontmatter',
        fullPath,
        'updated',
        entry.lastModified.slice(0, 10),
        proposedDate
      );
      const autoApplyable = true;
      if (autoOnly && !autoApplyable) continue;
      proposals.push({
        id,
        type: 'frontmatter',
        target: fullPath,
        field: 'updated',
        currentValue: entry.lastModified.slice(0, 10),
        proposedValue: proposedDate,
        reason: `Stale (${entry.daysSinceUpdate} days); bump updated date`,
        confidence: 0.9,
        autoApplyable,
        planId: planName,
      });
    }
  }

  return { proposals };
}

export interface ApplyProposalResult {
  applied: boolean;
  path?: string;
  backup?: string;
  error?: string;
}

/**
 * Apply a single proposal by id. Regenerates proposals to find the id (optionally scoped by planId).
 */
export function applyProposal(
  config: ServerConfig,
  proposalId: string,
  confirm: boolean,
  planId?: string
): ApplyProposalResult {
  if (!confirm) {
    return { applied: false, error: 'confirm must be true to apply' };
  }

  const scopePlanId = planId ?? extractPlanIdFromProposalId(proposalId) ?? undefined;
  const planDirs = resolvePlanDirs(config, scopePlanId);
  if (planDirs.length === 0 && scopePlanId) {
    return { applied: false, error: `Plan not found: ${scopePlanId}` };
  }
  const allProposals: UpdateProposal[] = [];
  for (const { dir, planId: p } of planDirs) {
    const planName = dir.split(/[/\\]/).pop() ?? p;
    const result = getProposals(config, {
      planId: planName,
      codebasePath: config.health?.drift?.codebasePath,
    });
    allProposals.push(...result.proposals);
  }

  const proposal = allProposals.find((p) => p.id === proposalId);
  if (!proposal) {
    return { applied: false, error: `Proposal not found: ${proposalId}` };
  }

  const handler = new FrontmatterHandler();
  const targetPath = proposal.target;

  if (!existsSync(targetPath)) {
    return { applied: false, error: `Target file not found: ${targetPath}` };
  }

  const backupPath = `${targetPath}.backup-${Date.now()}`;
  copyFileSync(targetPath, backupPath);

  try {
    const raw = readFileSync(targetPath, 'utf-8');
    const parsed = handler.parse(raw);

    if (proposal.type === 'status' && proposal.field === 'status') {
      (parsed.frontmatter as Record<string, unknown>).status = proposal.proposedValue;
    } else if (proposal.type === 'frontmatter' && proposal.field) {
      (parsed.frontmatter as Record<string, unknown>)[proposal.field] = proposal.proposedValue;
    } else if (proposal.type === 'file_list') {
      // Update files array: replace currentValue with proposedValue or remove
      const files = (parsed.frontmatter as Record<string, unknown>).files;
      if (Array.isArray(files)) {
        const updated = files
          .map((f) => {
            if (typeof f === 'string' && f === proposal.currentValue) {
              return proposal.proposedValue ?? undefined;
            }
            if (
              typeof f === 'object' &&
              f !== null &&
              (f as { path?: string }).path === proposal.currentValue
            ) {
              return proposal.proposedValue ? { path: proposal.proposedValue } : undefined;
            }
            return f;
          })
          .filter((f) => f !== undefined && f !== null);
        (parsed.frontmatter as Record<string, unknown>).files = updated;
      }
    } else {
      return {
        applied: false,
        error: `Unsupported proposal type: ${proposal.type}`,
        backup: backupPath,
      };
    }

    const newContent = handler.stringify(parsed.frontmatter, parsed.content);
    writeFileSync(targetPath, newContent, 'utf-8');
    return { applied: true, path: targetPath, backup: backupPath };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { applied: false, error: message, backup: backupPath };
  }
}
