import { Modal, Notice } from 'obsidian';
import type LimpsPlugin from '../main.js';
import { LimpsToolWrapper } from '../mcp/tool-wrapper.js';
import type { CliOptions } from '../mcp/client-manager.js';

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

function getActiveFilePath(plugin: LimpsPlugin): string | null {
  const file = plugin.app.workspace.getActiveFile?.() ?? null;
  if (!file) {
    new Notice('No active file open.', 4000);
    return null;
  }
  return file.path;
}

async function readActiveFileContent(plugin: LimpsPlugin): Promise<{ path: string; content: string } | null> {
  const file = plugin.app.workspace.getActiveFile?.() ?? null;
  if (!file) {
    new Notice('No active file open.', 4000);
    return null;
  }

  try {
    const content = await plugin.app.vault.read(file);
    return { path: file.path, content };
  } catch (error) {
    new Notice(`Failed to read file: ${error instanceof Error ? error.message : String(error)}`, 7000);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Confirmation modal
// ---------------------------------------------------------------------------

class ConfirmDeleteModal extends Modal {
  private readonly filePath: string;
  private readonly onConfirmCallback: () => void;

  constructor(plugin: LimpsPlugin, filePath: string, onConfirm: () => void) {
    super(plugin.app);
    this.filePath = filePath;
    this.onConfirmCallback = onConfirm;
  }

  onOpen(): void {
    const { contentEl } = this;

    const heading = document.createElement('h3');
    heading.textContent = 'Delete LIMPS Document';
    contentEl.appendChild(heading);

    const message = document.createElement('p');
    message.textContent = `Are you sure you want to delete "${this.filePath}" from the LIMPS index?`;
    contentEl.appendChild(message);

    const buttonContainer = document.createElement('div');
    buttonContainer.className = 'modal-button-container';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => this.close());
    buttonContainer.appendChild(cancelBtn);

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = 'Delete';
    confirmBtn.className = 'mod-warning';
    confirmBtn.addEventListener('click', () => {
      this.close();
      this.onConfirmCallback();
    });
    buttonContainer.appendChild(confirmBtn);

    contentEl.appendChild(buttonContainer);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

// ---------------------------------------------------------------------------
// Command handlers
// ---------------------------------------------------------------------------

async function handleCreateDoc(plugin: LimpsPlugin): Promise<void> {
  const wrapper = getToolWrapper(plugin);
  if (!wrapper) return;

  const fileData = await readActiveFileContent(plugin);
  if (!fileData) return;

  const result = await wrapper.createDoc(fileData.path, fileData.content);
  if (result.success) {
    new Notice(`Created LIMPS doc: ${fileData.path}`, 4000);
  } else {
    new Notice(`Failed to create doc: ${result.error ?? 'unknown error'}`, 7000);
  }
}

async function handleUpdateDoc(plugin: LimpsPlugin): Promise<void> {
  const wrapper = getToolWrapper(plugin);
  if (!wrapper) return;

  const fileData = await readActiveFileContent(plugin);
  if (!fileData) return;

  const result = await wrapper.updateDoc(fileData.path, fileData.content);
  if (result.success) {
    new Notice(`Updated LIMPS doc: ${fileData.path}`, 4000);
  } else {
    new Notice(`Failed to update doc: ${result.error ?? 'unknown error'}`, 7000);
  }
}

function handleDeleteDoc(plugin: LimpsPlugin): void {
  const wrapper = getToolWrapper(plugin);
  if (!wrapper) return;

  const filePath = getActiveFilePath(plugin);
  if (!filePath) return;

  new ConfirmDeleteModal(plugin, filePath, () => {
    void (async (): Promise<void> => {
      const result = await wrapper.deleteDoc(filePath);
      if (result.success) {
        new Notice(`Deleted LIMPS doc: ${filePath}`, 4000);
      } else {
        new Notice(`Failed to delete doc: ${result.error ?? 'unknown error'}`, 7000);
      }
    })();
  }).open();
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export function registerDocCommands(plugin: LimpsPlugin): void {
  plugin.addCommand({
    id: 'limps:create-doc',
    name: 'Local Intelligence: Create Document',
    callback: () => {
      void handleCreateDoc(plugin);
    },
  });

  plugin.addCommand({
    id: 'limps:update-doc',
    name: 'Local Intelligence: Update Document',
    callback: () => {
      void handleUpdateDoc(plugin);
    },
  });

  plugin.addCommand({
    id: 'limps:delete-doc',
    name: 'Local Intelligence: Delete Document',
    callback: () => {
      handleDeleteDoc(plugin);
    },
  });
}

export function addDocContextMenuActions(
  plugin: LimpsPlugin,
  menu: { addItem: (cb: (item: { setTitle: (t: string) => unknown; setIcon: (i: string) => unknown; onClick: (cb: () => unknown) => unknown }) => void) => void },
  filePath: string | null
): void {
  if (!filePath) return;

  menu.addItem((item) => {
    item.setTitle('Local Intelligence: Create Document');
    item.setIcon('file-plus');
    item.onClick(() => {
      void handleCreateDoc(plugin);
    });
  });

  menu.addItem((item) => {
    item.setTitle('Local Intelligence: Update Document');
    item.setIcon('file-edit');
    item.onClick(() => {
      void handleUpdateDoc(plugin);
    });
  });

  menu.addItem((item) => {
    item.setTitle('Local Intelligence: Delete Document');
    item.setIcon('file-minus');
    item.onClick(() => {
      handleDeleteDoc(plugin);
    });
  });
}
