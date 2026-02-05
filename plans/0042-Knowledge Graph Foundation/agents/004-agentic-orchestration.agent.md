---
title: Proactive Watch Mode
status: GAP
persona: coder
depends_on: [000, 001, 002]
files: [src/watch/index.ts, src/watch/detector.ts, src/watch/notifier.ts]
tags: [watch, proactive, conflicts]
---

# Agent 004: Proactive Watch Mode

## Objective

Watch for file changes, auto-index, and surface conflicts proactively. **No query needed — system detects problems automatically.**

## Context

This is the key differentiator from AI-dependent systems. Instead of waiting for AI to ask "are there conflicts?", the system:
1. Watches for file changes
2. Re-indexes affected entities
3. Runs conflict detection
4. Notifies (stdout, file, webhook, toast)

## Tasks

### 1. File Watcher (`src/watch/index.ts`)

```typescript
import chokidar from 'chokidar';

export class GraphWatcher {
  private watcher: chokidar.FSWatcher | null = null;
  
  constructor(
    private plansDir: string,
    private extractor: EntityExtractor,
    private storage: GraphStorage,
    private detector: ConflictDetector,
    private notifier: Notifier
  ) {}
  
  start(options: WatchOptions = {}): void {
    const {
      interval = 100,        // Debounce interval
      onConflict = 'log',    // 'log' | 'notify' | 'webhook'
      webhookUrl,
    } = options;
    
    this.watcher = chokidar.watch(this.plansDir, {
      ignored: /(^|[\/\\])\../, // Ignore dotfiles
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: interval,
        pollInterval: 100,
      },
    });
    
    this.watcher
      .on('add', path => this.handleChange(path, 'add'))
      .on('change', path => this.handleChange(path, 'change'))
      .on('unlink', path => this.handleChange(path, 'delete'));
    
    console.log(`👁️  Watching ${this.plansDir} for changes...`);
  }
  
  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }
  
  private async handleChange(path: string, event: 'add' | 'change' | 'delete'): Promise<void> {
    // Only process plan/agent markdown files
    if (!path.endsWith('.md')) return;
    if (!path.includes('-plan.md') && !path.includes('.agent.md')) return;
    
    console.log(`📝 ${event}: ${path}`);
    
    // Re-index affected plan
    const planPath = this.getPlanPath(path);
    if (planPath) {
      const result = this.extractor.extractPlan(planPath);
      this.storage.bulkUpsertEntities(result.entities);
      this.storage.bulkUpsertRelationships(result.relationships);
    }
    
    // Run conflict detection
    const conflicts = this.detector.detectAll();
    
    // Notify if conflicts found
    if (conflicts.length > 0) {
      this.notifier.notify(conflicts);
    }
  }
  
  private getPlanPath(filePath: string): string | null {
    // Extract plan directory from file path
    const match = filePath.match(/(plans\/\d{4}[^\/]+)/);
    return match ? match[1] : null;
  }
}
```

### 2. Conflict Detector (`src/watch/detector.ts`)

```typescript
export type ConflictSeverity = 'info' | 'warning' | 'critical';

export interface Conflict {
  type: 'file_contention' | 'feature_overlap' | 'circular_dependency' | 'stale_wip';
  severity: ConflictSeverity;
  message: string;
  entities: string[];  // Canonical IDs involved
  suggestion?: string;
}

export class ConflictDetector {
  constructor(private storage: GraphStorage) {}
  
  detectAll(): Conflict[] {
    return [
      ...this.detectFileContention(),
      ...this.detectFeatureOverlap(),
      ...this.detectCircularDependencies(),
      ...this.detectStaleWIP(),
    ];
  }
  
  /**
   * Two agents modifying same file
   */
  detectFileContention(): Conflict[] {
    const conflicts: Conflict[] = [];
    const files = this.storage.getEntitiesByType('file');
    
    for (const file of files) {
      // Get all agents that MODIFY this file
      const modifiers = this.storage.getRelationshipsByType('MODIFIES')
        .filter(r => r.targetId === file.id)
        .map(r => this.storage.getEntity(r.sourceId)!);
      
      if (modifiers.length < 2) continue;
      
      // Check status combinations
      const wipAgents = modifiers.filter(a => a.metadata.status === 'WIP');
      const gapAgents = modifiers.filter(a => a.metadata.status === 'GAP');
      
      if (wipAgents.length >= 2) {
        conflicts.push({
          type: 'file_contention',
          severity: 'critical',
          message: `Two WIP agents modifying ${file.name}`,
          entities: wipAgents.map(a => a.canonicalId),
          suggestion: 'Block one agent until the other completes',
        });
      } else if (wipAgents.length === 1 && gapAgents.length >= 1) {
        conflicts.push({
          type: 'file_contention',
          severity: 'warning',
          message: `WIP + GAP agents will modify ${file.name}`,
          entities: [...wipAgents, ...gapAgents].map(a => a.canonicalId),
          suggestion: 'Consider sequencing these tasks',
        });
      }
    }
    
    return conflicts;
  }
  
  /**
   * Similar features across plans
   */
  detectFeatureOverlap(): Conflict[] {
    const conflicts: Conflict[] = [];
    const similarRels = this.storage.getRelationshipsByType('SIMILAR_TO');
    
    for (const rel of similarRels) {
      if (rel.confidence >= 0.85) {
        const a = this.storage.getEntity(rel.sourceId)!;
        const b = this.storage.getEntity(rel.targetId)!;
        
        conflicts.push({
          type: 'feature_overlap',
          severity: 'warning',
          message: `"${a.name}" and "${b.name}" are ${(rel.confidence * 100).toFixed(0)}% similar`,
          entities: [a.canonicalId, b.canonicalId],
          suggestion: 'Consider consolidating into single plan',
        });
      }
    }
    
    return conflicts;
  }
  
  /**
   * Circular dependencies
   */
  detectCircularDependencies(): Conflict[] {
    // DFS to find cycles in dependency graph
    const conflicts: Conflict[] = [];
    const agents = this.storage.getEntitiesByType('agent');
    
    for (const agent of agents) {
      const cycle = this.findCycle(agent.id, new Set(), []);
      if (cycle) {
        conflicts.push({
          type: 'circular_dependency',
          severity: 'critical',
          message: `Circular dependency: ${cycle.join(' → ')}`,
          entities: cycle,
          suggestion: 'Break the cycle by removing one dependency',
        });
      }
    }
    
    return conflicts;
  }
  
  /**
   * WIP agents with no recent activity
   */
  detectStaleWIP(): Conflict[] {
    const conflicts: Conflict[] = [];
    const agents = this.storage.getEntitiesByType('agent')
      .filter(a => a.metadata.status === 'WIP');
    
    const now = Date.now();
    const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;
    const FOURTEEN_DAYS = 14 * 24 * 60 * 60 * 1000;
    
    for (const agent of agents) {
      const age = now - new Date(agent.updatedAt).getTime();
      
      if (age > FOURTEEN_DAYS) {
        conflicts.push({
          type: 'stale_wip',
          severity: 'critical',
          message: `Agent ${agent.canonicalId} WIP for ${Math.floor(age / (24*60*60*1000))} days`,
          entities: [agent.canonicalId],
          suggestion: 'Either complete or mark as BLOCKED',
        });
      } else if (age > SEVEN_DAYS) {
        conflicts.push({
          type: 'stale_wip',
          severity: 'warning',
          message: `Agent ${agent.canonicalId} WIP for ${Math.floor(age / (24*60*60*1000))} days`,
          entities: [agent.canonicalId],
        });
      }
    }
    
    return conflicts;
  }
  
  private findCycle(id: number, visited: Set<number>, path: string[]): string[] | null {
    // Standard DFS cycle detection
    // ...
    return null;
  }
}
```

### 3. Notifier (`src/watch/notifier.ts`)

```typescript
export type NotifyTarget = 'log' | 'file' | 'notify' | 'webhook';

export class Notifier {
  constructor(private options: NotifierOptions = {}) {}
  
  notify(conflicts: Conflict[]): void {
    const { target = 'log', webhookUrl, filePath } = this.options;
    
    // Always log
    this.logConflicts(conflicts);
    
    // Additional targets
    if (target === 'file' && filePath) {
      this.writeToFile(conflicts, filePath);
    }
    
    if (target === 'notify') {
      this.sendDesktopNotification(conflicts);
    }
    
    if (target === 'webhook' && webhookUrl) {
      this.sendWebhook(conflicts, webhookUrl);
    }
  }
  
  private logConflicts(conflicts: Conflict[]): void {
    for (const c of conflicts) {
      const icon = c.severity === 'critical' ? '🚨' : c.severity === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`${icon} ${c.type.toUpperCase()}: ${c.message}`);
      if (c.suggestion) console.log(`   💡 ${c.suggestion}`);
    }
  }
  
  private sendDesktopNotification(conflicts: Conflict[]): void {
    // Use node-notifier or similar
    const critical = conflicts.filter(c => c.severity === 'critical');
    if (critical.length > 0) {
      // notifier.notify({ title: 'limps', message: ... });
    }
  }
}
```

## CLI Integration

```bash
# One-shot health check
limps graph health

# Watch mode
limps graph watch
limps graph watch --on-conflict notify
limps graph watch --on-conflict webhook --url http://...
```

## Acceptance Criteria

- [ ] File watcher detects add/change/delete
- [ ] Incremental reindex on file change (<500ms)
- [ ] All conflict types detected
- [ ] Notifications work (log, file, desktop, webhook)
- [ ] Watch mode is daemon-friendly (runs in background)
- [ ] Low CPU overhead (<5%)
