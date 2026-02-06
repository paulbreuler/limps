import type { Database as DatabaseType } from 'better-sqlite3';
import type { ServerConfig } from '../config.js';
import { GraphStorage } from '../graph/storage.js';
import {
  ConflictDetector,
  type ConflictDetectorOptions,
  type ConflictReport,
  type ConflictType,
} from '../graph/conflict-detector.js';

export interface GraphCheckOptions {
  type?: ConflictType;
  conflictOptions?: ConflictDetectorOptions;
}

export interface GraphCheckResult {
  conflicts: ConflictReport[];
  errorCount: number;
  warningCount: number;
  checkedType: ConflictType | 'all';
}

export function graphCheck(
  _config: ServerConfig,
  db: DatabaseType,
  options?: GraphCheckOptions
): GraphCheckResult {
  const storage = new GraphStorage(db);
  const detector = new ConflictDetector(storage, options?.conflictOptions);

  let conflicts: ConflictReport[];
  const checkedType = options?.type ?? 'all';

  if (options?.type) {
    switch (options.type) {
      case 'file_contention':
        conflicts = detector.detectFileContention();
        break;
      case 'feature_overlap':
        conflicts = detector.detectFeatureOverlap();
        break;
      case 'circular_dependency':
        conflicts = detector.detectCircularDependencies();
        break;
      case 'stale_wip':
        conflicts = detector.detectStaleWip();
        break;
      default:
        conflicts = detector.detectAll();
    }
  } else {
    conflicts = detector.detectAll();
  }

  return {
    conflicts,
    errorCount: conflicts.filter((c) => c.severity === 'error').length,
    warningCount: conflicts.filter((c) => c.severity === 'warning').length,
    checkedType,
  };
}
