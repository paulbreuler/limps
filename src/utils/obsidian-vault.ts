/**
 * Utility functions for initializing Obsidian vaults programmatically.
 *
 * An Obsidian vault is simply a folder with a `.obsidian` subfolder containing
 * configuration files. This module provides functions to create this structure.
 */

import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

/**
 * Default Obsidian core plugins configuration.
 * Enables all standard plugins that come with Obsidian.
 */
const DEFAULT_CORE_PLUGINS = {
  'file-explorer': true,
  'global-search': true,
  switcher: true,
  graph: true,
  backlink: true,
  canvas: true,
  'outgoing-link': true,
  'tag-pane': true,
  footnotes: false,
  properties: true,
  'page-preview': true,
  'daily-notes': true,
  templates: true,
  'note-composer': true,
  'command-palette': true,
  'slash-command': false,
  'editor-status': true,
  bookmarks: true,
  'markdown-importer': false,
  'zk-prefixer': false,
  'random-note': false,
  outline: true,
  'word-count': true,
  slides: false,
  'audio-recorder': false,
  workspaces: false,
  'file-recovery': true,
  publish: false,
  sync: true,
  bases: true,
  webviewer: false,
};

/**
 * Default graph view configuration.
 */
const DEFAULT_GRAPH_CONFIG = {
  'collapse-filter': true,
  search: '',
  showTags: false,
  showAttachments: false,
  hideUnresolved: false,
  showOrphans: true,
  'collapse-color-groups': true,
  colorGroups: [],
  'collapse-display': true,
  showArrow: false,
  textFadeMultiplier: 0,
  nodeSizeMultiplier: 1,
  lineSizeMultiplier: 1,
  'collapse-forces': true,
  centerStrength: 0.518713248970312,
  repelStrength: 10,
  linkStrength: 1,
  linkDistance: 250,
  scale: 1,
  close: true,
};

/**
 * Initialize an Obsidian vault at the specified path.
 * Creates the `.obsidian` folder with minimal required configuration files.
 *
 * @param vaultPath - Path where the vault should be created (directory)
 * @param options - Optional configuration
 * @returns true if vault was created, false if it already existed
 * @throws Error if vaultPath is not a valid directory path or creation fails
 */
export function initObsidianVault(
  vaultPath: string,
  options: {
    /** Override default core plugins config */
    corePlugins?: Record<string, boolean>;
    /** Override default graph config */
    graphConfig?: Record<string, unknown>;
    /** Skip creating config files if .obsidian already exists */
    skipIfExists?: boolean;
  } = {}
): boolean {
  const {
    corePlugins = DEFAULT_CORE_PLUGINS,
    graphConfig = DEFAULT_GRAPH_CONFIG,
    skipIfExists = true,
  } = options;

  const obsidianDir = join(vaultPath, '.obsidian');

  // Check if vault already exists
  if (existsSync(obsidianDir)) {
    if (skipIfExists) {
      return false; // Vault already exists, skip creation
    }
    // If skipIfExists is false, we'll still create/update the config files
  }

  // Create .obsidian directory
  mkdirSync(obsidianDir, { recursive: true });

  // Create app.json (empty by default, Obsidian will populate it)
  const appJsonPath = join(obsidianDir, 'app.json');
  if (!existsSync(appJsonPath)) {
    writeFileSync(appJsonPath, JSON.stringify({}, null, 2), 'utf-8');
  }

  // Create core-plugins.json
  const corePluginsPath = join(obsidianDir, 'core-plugins.json');
  writeFileSync(corePluginsPath, JSON.stringify(corePlugins, null, 2), 'utf-8');

  // Create appearance.json (empty by default)
  const appearancePath = join(obsidianDir, 'appearance.json');
  if (!existsSync(appearancePath)) {
    writeFileSync(appearancePath, JSON.stringify({}, null, 2), 'utf-8');
  }

  // Create graph.json
  const graphPath = join(obsidianDir, 'graph.json');
  writeFileSync(graphPath, JSON.stringify(graphConfig, null, 2), 'utf-8');

  // Create workspace.json (basic layout - Obsidian will enhance this when opened)
  const workspacePath = join(obsidianDir, 'workspace.json');
  if (!existsSync(workspacePath)) {
    const defaultWorkspace = {
      main: {
        id: generateId(),
        type: 'split',
        children: [
          {
            id: generateId(),
            type: 'tabs',
            children: [],
          },
        ],
        direction: 'vertical',
      },
      left: {
        id: generateId(),
        type: 'split',
        children: [
          {
            id: generateId(),
            type: 'tabs',
            children: [
              {
                id: generateId(),
                type: 'leaf',
                state: {
                  type: 'file-explorer',
                  state: {
                    sortOrder: 'alphabetical',
                    autoReveal: false,
                  },
                  icon: 'lucide-folder-closed',
                  title: 'Files',
                },
              },
            ],
          },
        ],
        direction: 'horizontal',
        width: 300,
      },
    };
    writeFileSync(workspacePath, JSON.stringify(defaultWorkspace, null, 2), 'utf-8');
  }

  return true;
}

/**
 * Check if a directory is an Obsidian vault (has .obsidian folder).
 *
 * @param path - Path to check
 * @returns true if path contains a .obsidian folder
 */
export function isObsidianVault(path: string): boolean {
  return existsSync(join(path, '.obsidian'));
}

/**
 * Generate a random ID for Obsidian workspace nodes.
 * Obsidian uses 16-character hex IDs.
 */
function generateId(): string {
  return Array.from({ length: 16 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}
