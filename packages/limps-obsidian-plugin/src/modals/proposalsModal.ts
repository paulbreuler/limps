import { Modal, Notice } from 'obsidian';
import type LimpsPlugin from '../main.js';
import type { LimpsToolWrapper } from '../mcp/tool-wrapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface Proposal {
  id: string;
  type?: string;
  description?: string;
  path?: string;
  safe?: boolean;
  details?: string;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs?: Record<string, string>,
  text?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'className') {
        node.className = v;
      } else {
        node.setAttribute(k, v);
      }
    }
  }
  if (text !== undefined) node.textContent = text;
  return node;
}

// ---------------------------------------------------------------------------
// ProposalsModal
// ---------------------------------------------------------------------------

export class ProposalsModal extends Modal {
  private readonly wrapper: LimpsToolWrapper;
  private proposals: Proposal[] = [];
  private appliedIds = new Set<string>();
  private actionInFlight = false;

  constructor(_plugin: LimpsPlugin, wrapper: LimpsToolWrapper) {
    super(_plugin.app);
    this.wrapper = wrapper;
  }

  async onOpen(): Promise<void> {
    this.renderLoading();
    const result = await this.wrapper.getProposals();

    if (!result.success) {
      this.renderError(result.error ?? 'unknown error');
      return;
    }

    this.proposals = parseProposals(result.data);
    this.render();
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private renderLoading(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.appendChild(el('h3', undefined, 'Auto-Fix Proposals'));
    contentEl.appendChild(el('p', undefined, 'Loading proposals...'));
  }

  private renderError(error: string): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.appendChild(el('h3', undefined, 'Auto-Fix Proposals'));
    contentEl.appendChild(el('p', undefined, `Error: ${error}`));
  }

  private render(): void {
    const { contentEl } = this;
    contentEl.empty();

    contentEl.appendChild(el('h3', undefined, 'Auto-Fix Proposals'));

    const pending = this.proposals.filter((p) => !this.appliedIds.has(p.id));

    if (pending.length === 0) {
      contentEl.appendChild(el('p', undefined, this.proposals.length === 0
        ? 'No proposals available.'
        : 'All proposals have been applied.'));
      return;
    }

    const safeCount = pending.filter((p) => p.safe).length;
    const summaryText = `${pending.length} proposals (${safeCount} safe)`;
    contentEl.appendChild(el('p', undefined, summaryText));

    const list = el('div', { className: 'limps-proposals-list' });

    for (const proposal of pending) {
      const card = el('div', {
        className: 'limps-proposal-card',
        style: 'border:1px solid var(--background-modifier-border); border-radius:4px; padding:8px; margin-bottom:8px;',
      });

      const header = el('div', { style: 'display:flex; justify-content:space-between; align-items:center;' });

      const titleParts: string[] = [];
      if (proposal.type) titleParts.push(`[${proposal.type}]`);
      titleParts.push(proposal.description || proposal.id);
      header.appendChild(el('strong', undefined, titleParts.join(' ')));

      if (proposal.safe) {
        const badge = el('span', {
          style: 'font-size:0.75em; padding:2px 6px; border-radius:3px; background:var(--interactive-accent); color:var(--text-on-accent);',
        }, 'safe');
        header.appendChild(badge);
      }

      card.appendChild(header);

      if (proposal.path) {
        card.appendChild(el('div', { style: 'font-size:0.85em; opacity:0.7; margin-top:2px;' }, proposal.path));
      }

      if (proposal.details) {
        card.appendChild(el('div', { style: 'font-size:0.8em; opacity:0.6; margin-top:4px;' }, proposal.details));
      }

      const actions = el('div', { style: 'margin-top:6px; display:flex; gap:6px;' });

      const applyBtn = el('button', { className: 'mod-cta' }, 'Apply');
      if (this.actionInFlight) applyBtn.setAttribute('disabled', '');
      applyBtn.addEventListener('click', () => {
        void this.applyOne(proposal);
      });
      actions.appendChild(applyBtn);

      const skipBtn = el('button', undefined, 'Skip');
      skipBtn.addEventListener('click', () => {
        this.appliedIds.add(proposal.id);
        this.render();
      });
      actions.appendChild(skipBtn);

      card.appendChild(actions);
      list.appendChild(card);
    }

    contentEl.appendChild(list);

    // Bottom actions
    const bottomActions = el('div', { className: 'modal-button-container', style: 'margin-top:12px;' });

    if (safeCount > 0) {
      const applyAllSafe = el('button', { className: 'mod-cta' }, `Apply all safe (${safeCount})`);
      if (this.actionInFlight) applyAllSafe.setAttribute('disabled', '');
      applyAllSafe.addEventListener('click', () => {
        void this.applySafe();
      });
      bottomActions.appendChild(applyAllSafe);
    }

    const closeBtn = el('button', undefined, 'Close');
    closeBtn.addEventListener('click', () => this.close());
    bottomActions.appendChild(closeBtn);

    contentEl.appendChild(bottomActions);
  }

  private async applyOne(proposal: Proposal): Promise<void> {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    this.render();

    try {
      const result = await this.wrapper.applyProposal(proposal.id);
      if (result.success) {
        this.appliedIds.add(proposal.id);
        new Notice(`Applied proposal: ${proposal.description || proposal.id}`, 3000);
      } else {
        new Notice(`Failed: ${result.error ?? 'unknown error'}`, 7000);
      }
    } finally {
      this.actionInFlight = false;
      this.render();
    }
  }

  private async applySafe(): Promise<void> {
    if (this.actionInFlight) return;
    this.actionInFlight = true;
    this.render();

    const safeProposals = this.proposals.filter((p) => p.safe && !this.appliedIds.has(p.id));
    let applied = 0;
    let failed = 0;

    try {
      for (const proposal of safeProposals) {
        const result = await this.wrapper.applyProposal(proposal.id);
        if (result.success) {
          this.appliedIds.add(proposal.id);
          applied++;
        } else {
          failed++;
        }
      }

      if (failed > 0) {
        new Notice(`Applied ${applied} safe proposals, ${failed} failed`, 7000);
      } else {
        new Notice(`Applied ${applied} safe proposals`, 4000);
      }
    } finally {
      this.actionInFlight = false;
      this.render();
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseProposals(data: unknown): Proposal[] {
  if (!data || typeof data !== 'object') return [];

  let items: unknown[];
  if (Array.isArray(data)) {
    items = data;
  } else {
    const record = data as Record<string, unknown>;
    items = Array.isArray(record.proposals) ? record.proposals
      : Array.isArray(record.results) ? record.results
      : [];
  }

  return items
    .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
    .map((item) => ({
      id: typeof item.id === 'string' ? item.id : String(item.id ?? ''),
      type: typeof item.type === 'string' ? item.type : undefined,
      description: typeof item.description === 'string' ? item.description : typeof item.message === 'string' ? item.message : undefined,
      path: typeof item.path === 'string' ? item.path : typeof item.file === 'string' ? item.file : undefined,
      safe: typeof item.safe === 'boolean' ? item.safe : undefined,
      details: typeof item.details === 'string' ? item.details : undefined,
    }))
    .filter((p) => p.id.length > 0);
}

// ---------------------------------------------------------------------------
// Apply-safe-proposals (standalone, no modal)
// ---------------------------------------------------------------------------

export async function applySafeProposals(
  _plugin: LimpsPlugin,
  wrapper: LimpsToolWrapper
): Promise<void> {
  new Notice('Fetching proposals...', 2000);

  const result = await wrapper.getProposals();
  if (!result.success) {
    new Notice(`Failed to get proposals: ${result.error ?? 'unknown error'}`, 7000);
    return;
  }

  const proposals = parseProposals(result.data);
  const safeProposals = proposals.filter((p) => p.safe);

  if (safeProposals.length === 0) {
    new Notice('No safe proposals to apply.', 4000);
    return;
  }

  let applied = 0;
  let failed = 0;

  for (const proposal of safeProposals) {
    const applyResult = await wrapper.applyProposal(proposal.id);
    if (applyResult.success) {
      applied++;
    } else {
      failed++;
    }
  }

  if (failed > 0) {
    new Notice(`Applied ${applied}/${safeProposals.length} safe proposals (${failed} failed)`, 7000);
  } else {
    new Notice(`Applied all ${applied} safe proposals`, 4000);
  }
}
