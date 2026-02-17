import { Notice, SuggestModal } from 'obsidian';
import type LimpsPlugin from '../main.js';
import { LimpsToolWrapper } from '../mcp/tool-wrapper.js';
import type { CliOptions } from '../mcp/client-manager.js';
import { NextTaskModal } from '../modals/nextTaskModal.js';

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

function extractTaskIdFromPath(filePath: string): string | null {
  // Agent file path: plans/{planFolder}/agents/{agentNumber}-{title}.md
  // Task ID: planFolder#agentNumber
  const match = filePath.match(/plans\/([^/]+)\/agents\/(\d{3})/);
  if (!match || !match[1] || !match[2]) return null;
  return `${match[1]}#${match[2]}`;
}

// ---------------------------------------------------------------------------
// Status picker modal
// ---------------------------------------------------------------------------

const TASK_STATUSES = ['GAP', 'WIP', 'PASS', 'BLOCKED'] as const;

class StatusPickerModal extends SuggestModal<string> {
  private readonly wrapper: LimpsToolWrapper;
  private readonly taskId: string;

  constructor(plugin: LimpsPlugin, wrapper: LimpsToolWrapper, taskId: string) {
    super(plugin.app);
    this.wrapper = wrapper;
    this.taskId = taskId;
    this.setPlaceholder(`Pick status for ${taskId}`);
  }

  getSuggestions(query: string): string[] {
    const lower = query.toLowerCase();
    return TASK_STATUSES.filter((s) => s.toLowerCase().includes(lower));
  }

  renderSuggestion(status: string, el: HTMLElement): void {
    const div = document.createElement('div');
    div.textContent = status;
    el.appendChild(div);
  }

  async onChooseSuggestion(status: string): Promise<void> {
    const result = await this.wrapper.updateTaskStatus(this.taskId, status);
    if (result.success) {
      new Notice(`Updated ${this.taskId} to ${status}`, 4000);
    } else {
      new Notice(`Failed to update status: ${result.error ?? 'unknown error'}`, 7000);
    }
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

function handleGetNextTask(plugin: LimpsPlugin): void {
  const wrapper = getToolWrapper(plugin);
  if (!wrapper) return;

  new NextTaskModal(plugin, wrapper).open();
}

function handleUpdateTaskStatus(plugin: LimpsPlugin): void {
  const wrapper = getToolWrapper(plugin);
  if (!wrapper) return;

  const file = plugin.app.workspace.getActiveFile?.() ?? null;
  if (!file) {
    new Notice('No active file open.', 4000);
    return;
  }

  const taskId = extractTaskIdFromPath(file.path);
  if (!taskId) {
    new Notice('Current file is not an agent file. Expected path: plans/{plan}/agents/{number}-*.md', 7000);
    return;
  }

  new StatusPickerModal(plugin, wrapper, taskId).open();
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerTaskCommands(plugin: LimpsPlugin): void {
  plugin.addCommand({
    id: 'limps:get-next-task',
    name: 'Local Intelligence: Get Next Task',
    callback: () => {
      handleGetNextTask(plugin);
    },
  });

  plugin.addCommand({
    id: 'limps:update-task-status',
    name: 'Local Intelligence: Update Task Status',
    callback: () => {
      handleUpdateTaskStatus(plugin);
    },
  });
}
