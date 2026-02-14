import type { Plugin } from 'obsidian';
import type { LimpsRunOptions } from '../cli/wrapper.js';
import { runGraphReindex } from '../cli/wrapper.js';

export class VaultEventHandler {
  private readonly plugin: Plugin;
  private readonly debounceMs: number;
  private readonly getRunOptions: () => LimpsRunOptions;
  private readonly relativePlansPrefix: string;
  private readonly onReindex: () => void;
  private debounceTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private registered = false;

  constructor(options: {
    plugin: Plugin;
    debounceMs: number;
    plansPath: string;
    vaultPath: string;
    getRunOptions: () => LimpsRunOptions;
    onReindex: () => void;
  }) {
    this.plugin = options.plugin;
    this.debounceMs = Math.max(200, options.debounceMs);
    this.relativePlansPrefix = computeRelativePrefix(options.vaultPath, options.plansPath);
    this.getRunOptions = options.getRunOptions;
    this.onReindex = options.onReindex;
  }

  register(): void {
    if (this.registered) return;
    this.registered = true;

    const vault = this.plugin.app.vault;
    const registerVaultEvent = (eventName: string): void => {
      const emitter = vault as unknown as {
        on: (name: string, cb: (...args: unknown[]) => void) => unknown;
      };
      const ref = emitter.on(eventName, (...args: unknown[]) => {
        const filePath = extractFilePath(args);
        if (filePath !== null && this.shouldHandle(filePath)) {
          this.scheduleReindex();
        }
      });
      if (ref && typeof this.plugin.registerEvent === 'function') {
        this.plugin.registerEvent(ref as ReturnType<typeof vault.on>);
      }
    };

    registerVaultEvent('modify');
    registerVaultEvent('delete');
    registerVaultEvent('rename');
  }

  unregister(): void {
    this.cancelPending();
    this.registered = false;
  }

  /** Visible for testing. */
  shouldHandle(filePath: string): boolean {
    if (!isMarkdownFile(filePath)) return false;
    const normalized = filePath.replace(/\\/g, '/');
    return normalized.startsWith(this.relativePlansPrefix);
  }

  private scheduleReindex(): void {
    this.cancelPending();
    this.debounceTimeoutId = setTimeout(() => {
      this.debounceTimeoutId = null;
      void this.doReindex();
    }, this.debounceMs);
  }

  private cancelPending(): void {
    if (this.debounceTimeoutId !== null) {
      clearTimeout(this.debounceTimeoutId);
      this.debounceTimeoutId = null;
    }
  }

  private async doReindex(): Promise<void> {
    const options = this.getRunOptions();
    await runGraphReindex(options);
    this.onReindex();
  }
}

function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith('.md');
}

function computeRelativePrefix(vaultPath: string, plansPath: string): string {
  const normalizedVault = vaultPath.replace(/\\/g, '/').replace(/\/+$/, '') + '/';
  let normalizedPlans = plansPath.replace(/\\/g, '/');

  // If plansPath is absolute and starts with vaultPath, compute relative
  if (normalizedPlans.startsWith(normalizedVault)) {
    normalizedPlans = normalizedPlans.slice(normalizedVault.length);
  }

  // Strip leading slashes for relative comparison
  normalizedPlans = normalizedPlans.replace(/^\/+/, '');

  if (!normalizedPlans.endsWith('/')) {
    normalizedPlans += '/';
  }

  return normalizedPlans;
}

function extractFilePath(args: unknown[]): string | null {
  if (args.length === 0) return null;
  const first = args[0];
  if (typeof first === 'string') return first;
  if (first && typeof first === 'object') {
    const obj = first as Record<string, unknown>;
    if (typeof obj.path === 'string') return obj.path;
  }
  return null;
}
