import { Notice } from 'obsidian';
import type LimpsPlugin from '../main.js';
import { LimpsToolWrapper } from '../mcp/tool-wrapper.js';
import type { CliOptions } from '../mcp/client-manager.js';
import { SearchModal } from '../modals/searchModal.js';
import { ProposalsModal, applySafeProposals } from '../modals/proposalsModal.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getToolWrapper(plugin: LimpsPlugin): LimpsToolWrapper | null {
  const client = plugin.getMcpClient();
  if (!client) {
    new Notice('limps MCP client not initialized. Enable persistent MCP in settings.', 7000);
    return null;
  }

  const cliOptions: CliOptions = {
    limpsPath: plugin.getEffectiveBinaryPathPreview(),
    cwd: plugin.getVaultPath(),
    timeoutMs: plugin.settings.commandTimeoutMs,
  };

  return new LimpsToolWrapper(client, cliOptions);
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function handleSearchDocs(plugin: LimpsPlugin): void {
  const wrapper = getToolWrapper(plugin);
  if (!wrapper) return;

  new SearchModal(plugin, wrapper).open();
}

function handleShowProposals(plugin: LimpsPlugin): void {
  const wrapper = getToolWrapper(plugin);
  if (!wrapper) return;

  new ProposalsModal(plugin, wrapper).open();
}

function handleApplySafeProposals(plugin: LimpsPlugin): void {
  const wrapper = getToolWrapper(plugin);
  if (!wrapper) return;

  void applySafeProposals(plugin, wrapper);
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerSearchProposalCommands(plugin: LimpsPlugin): void {
  plugin.addCommand({
    id: 'limps:search-docs',
    name: 'Local Intelligence: Search Documents',
    callback: () => {
      handleSearchDocs(plugin);
    },
  });

  plugin.addCommand({
    id: 'limps:show-proposals',
    name: 'Local Intelligence: Show Auto-Fix Proposals',
    callback: () => {
      handleShowProposals(plugin);
    },
  });

  plugin.addCommand({
    id: 'limps:apply-safe-proposals',
    name: 'Local Intelligence: Apply All Safe Proposals',
    callback: () => {
      handleApplySafeProposals(plugin);
    },
  });
}
