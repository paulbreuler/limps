import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import type { GraphStats } from '../graph/types.js';
import { ConflictDetector, type ConflictReport } from '../graph/conflict-detector.js';

export interface GraphHealthResult {
  stats: GraphStats;
  conflicts: ConflictReport[];
  summary: {
    totalEntities: number;
    totalRelations: number;
    conflictCount: number;
    errorCount: number;
    warningCount: number;
    lastIndexed: string;
  };
}

export function graphHealth(_config: ServerConfig, db: DatabaseType): GraphHealthResult {
  const storage = new GraphStorage(db);
  const stats = storage.getStats();
  const detector = new ConflictDetector(storage);
  const conflicts = detector.detectAll();

  return {
    stats,
    conflicts,
    summary: {
      totalEntities: stats.totalEntities,
      totalRelations: stats.totalRelations,
      conflictCount: conflicts.length,
      errorCount: conflicts.filter((c) => c.severity === 'error').length,
      warningCount: conflicts.filter((c) => c.severity === 'warning').length,
      lastIndexed: stats.lastIndexed,
    },
  };
}

export function renderGraphHealth(result: GraphHealthResult): string {
  const lines: string[] = [];
  lines.push('Knowledge Graph Health');
  lines.push('=====================');
  lines.push('');
  lines.push(`Entities: ${result.summary.totalEntities}`);

  const { entityCounts } = result.stats;
  for (const [type, count] of Object.entries(entityCounts) as [string, number][]) {
    if (count > 0) {
      lines.push(`  ${type}: ${count}`);
    }
  }

  lines.push('');
  lines.push(`Relations: ${result.summary.totalRelations}`);

  const { relationCounts } = result.stats;
  for (const [type, count] of Object.entries(relationCounts) as [string, number][]) {
    if (count > 0) {
      lines.push(`  ${type}: ${count}`);
    }
  }

  lines.push('');
  if (result.summary.lastIndexed) {
    lines.push(`Last indexed: ${result.summary.lastIndexed}`);
  }

  if (result.conflicts.length > 0) {
    lines.push('');
    lines.push(
      `Conflicts: ${result.summary.conflictCount} (${result.summary.errorCount} errors, ${result.summary.warningCount} warnings)`
    );
    for (const conflict of result.conflicts) {
      const prefix = conflict.severity === 'error' ? 'ERROR' : 'WARN';
      lines.push(`  [${prefix}] ${conflict.message}`);
    }
  } else {
    lines.push('');
    lines.push('No conflicts detected.');
  }

  return lines.join('\n');
}
