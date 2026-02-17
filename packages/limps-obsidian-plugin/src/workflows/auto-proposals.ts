import type { LimpsToolWrapper, ToolResult } from '../mcp/tool-wrapper.js';
import type { Proposal } from '../modals/proposalsModal.js';
import type { NotificationManager } from './notification-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export const DEFAULT_AUTO_APPLY_TYPES: readonly string[] = [
  'frontmatter_cleanup',
  'staleness_update',
  'link_normalization',
];

export interface AutoProposalOptions {
  wrapper: LimpsToolWrapper;
  notificationManager: NotificationManager;
  allowedTypes: readonly string[];
}

export interface AutoProposalResult {
  fetched: number;
  eligible: number;
  applied: number;
  failed: number;
  rolledBack: number;
  errors: string[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseProposalsFromResult(data: unknown): Proposal[] {
  if (!data || typeof data !== 'object') return [];

  let items: unknown[];
  if (Array.isArray(data)) {
    items = data;
  } else {
    const record = data as Record<string, unknown>;
    items = Array.isArray(record.proposals)
      ? record.proposals
      : Array.isArray(record.results)
        ? record.results
        : [];
  }

  return items
    .filter(
      (item): item is Record<string, unknown> =>
        item !== null && typeof item === 'object'
    )
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : String(item.id ?? ''),
      type: typeof item.type === 'string' ? item.type : undefined,
      description:
        typeof item.description === 'string'
          ? item.description
          : typeof item.message === 'string'
            ? item.message
            : undefined,
      path:
        typeof item.path === 'string'
          ? item.path
          : typeof item.file === 'string'
            ? item.file
            : undefined,
      safe: typeof item.safe === 'boolean' ? item.safe : undefined,
      details: typeof item.details === 'string' ? item.details : undefined,
    }))
    .filter((p) => p.id.length > 0);
}

function isEligible(
  proposal: Proposal,
  allowedTypes: readonly string[]
): boolean {
  if (!proposal.type) return false;
  return allowedTypes.includes(proposal.type);
}

// ---------------------------------------------------------------------------
// runAutoProposals
// ---------------------------------------------------------------------------

export async function runAutoProposals(
  options: AutoProposalOptions
): Promise<AutoProposalResult> {
  const { wrapper, notificationManager, allowedTypes } = options;

  const result: AutoProposalResult = {
    fetched: 0,
    eligible: 0,
    applied: 0,
    failed: 0,
    rolledBack: 0,
    errors: [],
  };

  // Fetch proposals
  let fetchResult: ToolResult;
  try {
    fetchResult = await wrapper.getProposals();
  } catch (error) {
    const msg = `Auto-proposals: failed to fetch: ${error instanceof Error ? error.message : String(error)}`;
    result.errors.push(msg);
    notificationManager.notify('error', msg);
    return result;
  }

  if (!fetchResult.success) {
    const msg = `Auto-proposals: fetch failed: ${fetchResult.error ?? 'unknown error'}`;
    result.errors.push(msg);
    notificationManager.notify('error', msg);
    return result;
  }

  const proposals = parseProposalsFromResult(fetchResult.data);
  result.fetched = proposals.length;

  const eligible = proposals.filter((p) => isEligible(p, allowedTypes));
  result.eligible = eligible.length;

  if (eligible.length === 0) {
    return result;
  }

  // Apply each eligible proposal with rollback tracking
  const appliedIds: string[] = [];

  for (const proposal of eligible) {
    let applyResult: ToolResult;
    try {
      applyResult = await wrapper.applyProposal(proposal.id);
    } catch (error) {
      const msg = `Auto-proposals: apply '${proposal.id}' threw: ${error instanceof Error ? error.message : String(error)}`;
      result.errors.push(msg);
      result.failed++;
      continue;
    }

    if (applyResult.success) {
      appliedIds.push(proposal.id);
      result.applied++;
    } else {
      const msg = `Auto-proposals: apply '${proposal.id}' failed: ${applyResult.error ?? 'unknown'}`;
      result.errors.push(msg);
      result.failed++;
    }
  }

  // Summary notification
  if (result.failed > 0 && result.applied > 0) {
    notificationManager.notify(
      'warning',
      `Auto-proposals: applied ${result.applied}/${result.eligible}, ${result.failed} failed`
    );
  } else if (result.failed > 0) {
    notificationManager.notify(
      'error',
      `Auto-proposals: all ${result.failed} eligible proposals failed`
    );
  } else if (result.applied > 0) {
    notificationManager.notify(
      'success',
      `Auto-proposals: applied ${result.applied} proposals (${allowedTypes.join(', ')})`
    );
  }

  return result;
}
