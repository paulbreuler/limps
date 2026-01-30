/**
 * Type definitions for the audit report pipeline.
 */

/**
 * Priority levels for report issues.
 */
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Severity for contraventions (policy/version drift).
 */
export type ContraventionSeverity = 'high' | 'medium' | 'low';

/**
 * Policy options for audit (Agent 0 #5).
 */
export type BackendMode = 'auto' | 'base' | 'radix-legacy';

export type MigrationThreshold = 'low' | 'medium' | 'high';

export interface RunAuditOptions {
  backendMode: BackendMode;
  migrationThreshold: MigrationThreshold;
  failOnMixed: boolean;
  includeLegacy: boolean;
}

/**
 * Options for component discovery.
 */
export interface DiscoveryOptions {
  rootDir?: string;
  includePatterns?: string[];
  excludePatterns?: string[];
}

/**
 * Metadata for a discovered component.
 */
export interface ComponentMetadata {
  path: string;
  name: string;
  exportType?: 'default' | 'named' | 'both';
  propsInterface?: string;
  dependencies?: string[];
}

export interface ComponentInventory {
  components: ComponentMetadata[];
}

/**
 * A single contravention (e.g. legacy package usage, non-tree-shaking).
 */
export interface Contravention {
  id: string;
  type: string;
  severity: ContraventionSeverity;
  description: string;
  recommendation: string;
  location?: string;
}

/**
 * A single issue from analysis or diff.
 */
export interface AuditIssue {
  id: string;
  category: string;
  priority: IssuePriority;
  description: string;
  recommendation: string;
  location?: string;
}

/**
 * Audit report output shape.
 */
export interface AuditReport {
  metadata: {
    version: string;
    generatedAt: string;
    generatedBy: string;
  };
  summary: {
    totalComponents: number;
    issuesByPriority: Record<IssuePriority, number>;
    contraventions: number;
  };
  inventory?: ComponentMetadata[];
  compliance?: Array<{
    path: string;
    name: string;
    primitive: string | null;
    confidence: number;
    status: 'pass' | 'partial' | 'fail';
  }>;
  contraventions: Contravention[];
  issues: AuditIssue[];
  recommendations: string[];
}
