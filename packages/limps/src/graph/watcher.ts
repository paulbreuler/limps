import type { FSWatcher } from 'chokidar';
import { dirname, basename } from 'path';
import { readFileSync } from 'fs';
import { startWatcher, stopWatcher, type SettledChange } from '../watcher.js';
import type { GraphStorage } from './storage.js';
import { computeContentHash, hasChanged } from './storage.js';
import { EntityExtractor } from './extractor.js';
import { ConflictDetector, type ConflictDetectorOptions } from './conflict-detector.js';
import { Notifier, type NotifierConfig } from './notifier.js';

export interface GraphWatcherOptions {
  plansPath: string;
  conflictOptions?: ConflictDetectorOptions;
  notifierConfig?: NotifierConfig;
}

export class GraphWatcher {
  private watcher: FSWatcher | null = null;
  private readonly extractor = new EntityExtractor();
  private readonly detector: ConflictDetector | null;
  private readonly notifier: Notifier | null;

  constructor(
    private readonly storage: GraphStorage,
    private readonly options: GraphWatcherOptions
  ) {
    this.detector =
      options.conflictOptions !== undefined || options.notifierConfig !== undefined
        ? new ConflictDetector(storage, options.conflictOptions)
        : null;
    this.notifier = options.notifierConfig ? new Notifier(options.notifierConfig) : null;
  }

  start(): void {
    if (this.watcher) return;

    this.watcher = startWatcher(
      this.options.plansPath,
      async (path, event) => {
        await this.handleChange(path, event);
      },
      ['.md'],
      ['.git', 'node_modules', '.tmp', '.obsidian'],
      200,
      1500,
      async (changes) => {
        await this.handleSettled(changes);
      }
    );
  }

  async stop(): Promise<void> {
    if (this.watcher) {
      await stopWatcher(this.watcher);
      this.watcher = null;
    }
  }

  private async handleChange(path: string, event: 'add' | 'change' | 'unlink'): Promise<void> {
    if (event === 'unlink') {
      this.storage.deleteEntitiesBySource(path);
      return;
    }

    const planDir = this.inferPlanDir(path);
    if (!planDir) return;

    try {
      const content = readFileSync(path, 'utf-8');
      const hash = computeContentHash(content);

      if (!hasChanged(this.storage, path, hash)) return;

      const result = this.extractor.extractPlan(planDir);
      if (result.entities.length > 0) {
        this.storage.bulkUpsertEntities(result.entities);
      }
      if (result.relationships.length > 0) {
        this.storage.bulkUpsertRelationships(result.relationships);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`GraphWatcher: error processing ${path}: ${msg}`);
    }
  }

  private async handleSettled(_changes: SettledChange[]): Promise<void> {
    if (!this.detector || !this.notifier) return;

    try {
      const conflicts = this.detector.detectAll();
      await this.notifier.notify(conflicts);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`GraphWatcher: error in conflict detection: ${msg}`);
    }
  }

  private inferPlanDir(filePath: string): string | null {
    // Walk up directories looking for a plan folder pattern (NNNN-*)
    let dir = dirname(filePath);
    const plansPath = this.options.plansPath;

    for (let i = 0; i < 5; i++) {
      const folderName = basename(dir);
      if (/^\d{4}/.test(folderName)) {
        return dir;
      }
      const parent = dirname(dir);
      if (parent === dir || parent === plansPath) break;
      dir = parent;
    }
    return null;
  }
}
