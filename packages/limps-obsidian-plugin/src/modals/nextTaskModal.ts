import { Modal, Notice } from 'obsidian';
import type LimpsPlugin from '../main.js';
import type { LimpsToolWrapper, ToolResult } from '../mcp/tool-wrapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface NextTaskData {
  taskId?: string;
  title?: string;
  totalScore?: number;
  dependencyScore?: number;
  priorityScore?: number;
  workloadScore?: number;
  reasons?: string[];
  otherAvailableTasks?: number;
  message?: string;
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
// NextTaskModal
// ---------------------------------------------------------------------------

export class NextTaskModal extends Modal {
  private readonly plugin: LimpsPlugin;
  private readonly wrapper: LimpsToolWrapper;
  private readonly planId: string | undefined;

  constructor(plugin: LimpsPlugin, wrapper: LimpsToolWrapper, planId?: string) {
    super(plugin.app);
    this.plugin = plugin;
    this.wrapper = wrapper;
    this.planId = planId;
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.appendChild(el('h3', undefined, 'Next Available Task'));
    contentEl.appendChild(el('p', undefined, 'Loading...'));

    const result = await this.wrapper.getNextTask(this.planId);
    contentEl.empty();

    if (!result.success) {
      contentEl.appendChild(el('h3', undefined, 'Next Available Task'));
      contentEl.appendChild(el('p', undefined, `Error: ${result.error ?? 'unknown error'}`));
      return;
    }

    const data = result.data as NextTaskData | null;
    if (!data?.taskId) {
      contentEl.appendChild(el('h3', undefined, 'Next Available Task'));
      contentEl.appendChild(el('p', undefined, data?.message ?? 'No available tasks found.'));
      return;
    }

    this.renderTaskDetails(contentEl, data);
  }

  private renderTaskDetails(container: HTMLElement, data: NextTaskData): void {
    container.appendChild(el('h3', undefined, 'Next Available Task'));

    const table = el('table');
    const addRow = (label: string, value: string): void => {
      const row = el('tr');
      const labelCell = el('td', { style: 'font-weight:bold; padding-right:12px;' }, label);
      const valueCell = el('td', undefined, value);
      row.appendChild(labelCell);
      row.appendChild(valueCell);
      table.appendChild(row);
    };

    addRow('Task ID', data.taskId ?? '');
    addRow('Title', data.title ?? '');
    addRow('Total Score', String(data.totalScore ?? 0));
    addRow('Dependency', String(data.dependencyScore ?? 0));
    addRow('Priority', String(data.priorityScore ?? 0));
    addRow('Workload', String(data.workloadScore ?? 0));

    if (data.otherAvailableTasks !== undefined) {
      addRow('Other Available', String(data.otherAvailableTasks));
    }

    container.appendChild(table);

    if (data.reasons && data.reasons.length > 0) {
      const reasonsEl = el('div', { style: 'margin-top:8px;' });
      reasonsEl.appendChild(el('strong', undefined, 'Reasons:'));
      const ul = el('ul');
      for (const reason of data.reasons) {
        ul.appendChild(el('li', undefined, reason));
      }
      reasonsEl.appendChild(ul);
      container.appendChild(reasonsEl);
    }

    const buttonContainer = el('div', { className: 'modal-button-container', style: 'margin-top:12px;' });

    const openBtn = el('button', undefined, 'Open Agent');
    openBtn.addEventListener('click', () => {
      this.close();
      if (data.taskId) {
        void this.openAgentFile(data.taskId);
      }
    });
    buttonContainer.appendChild(openBtn);

    const wipBtn = el('button', { className: 'mod-cta' }, 'Mark WIP');
    wipBtn.addEventListener('click', () => {
      if (data.taskId) {
        void this.markWip(data.taskId);
      }
    });
    buttonContainer.appendChild(wipBtn);

    const closeBtn = el('button', undefined, 'Close');
    closeBtn.addEventListener('click', () => this.close());
    buttonContainer.appendChild(closeBtn);

    container.appendChild(buttonContainer);
  }

  private async openAgentFile(taskId: string): Promise<void> {
    // Task ID format: planFolder#agentNumber (e.g., "0001-feature-name#005")
    const parts = taskId.split('#');
    if (parts.length !== 2) {
      new Notice(`Cannot parse task ID: ${taskId}`, 5000);
      return;
    }

    const planFolder = parts[0];
    const agentNumber = parts[1];
    const agentPrefix = `plans/${planFolder}/agents/${agentNumber}`;

    const files = this.plugin.app.vault.getFiles();
    const match = files.find((f: { path: string }) => f.path.startsWith(agentPrefix) && f.path.endsWith('.md'));

    if (match) {
      await this.plugin.openFileAtLine(match.path);
    } else {
      new Notice(`Agent file not found for ${taskId}. Expected path starting with ${agentPrefix}`, 7000);
    }
  }

  private async markWip(taskId: string): Promise<void> {
    const result: ToolResult = await this.wrapper.updateTaskStatus(taskId, 'WIP');
    if (result.success) {
      new Notice(`Marked ${taskId} as WIP`, 4000);
    } else {
      new Notice(`Failed to mark WIP: ${result.error ?? 'unknown error'}`, 7000);
    }
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
