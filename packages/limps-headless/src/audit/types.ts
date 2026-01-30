/**
 * Type definitions for the audit report pipeline.
 */

/**
 * Priority levels for report issues.
 */
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';

/**
 * Backend identifier for headless UI libraries (Agent 1 #1).
 */
export type HeadlessBackend = 'radix' | 'base' | 'mixed' | 'unknown';

/**
 * Issue category for backend provider analysis (Agent 1 #2).
 */
export type IssueCategory = 'accessibility' | 'performance' | 'dependencies' | 'storybook' | 'migration';

/**
 * Issue from backend provider analysis (Agent 1 #2).
 */
export interface Issue {
  component?: string;
  category: IssueCategory;
  severity: IssuePriority;
  message: string;
  suggestion?: string;
  evidence?: string[];
}

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
 * Metadata for a discovered component (Agent 1 #1 - extended with backend detection).
 */
export interface ComponentMetadata {
  path: string;
  name: string;
  exportType?: 'default' | 'named' | 'both';
  propsInterface?: string;
  dependencies?: string[];
  /** Detected backend library (radix, base, mixed, unknown). */
  backend: HeadlessBackend;
  /** True if component uses both Radix and Base imports. */
  mixedUsage: boolean;
  /** Import sources that matched backend detection (e.g. "@radix-ui/react-dialog"). */
  importSources: string[];
  /** Pattern evidence found (e.g. "asChild", "render"). */
  evidence: string[];
  /** True if component exports a React component. */
  exportsComponent: boolean;
  /** Names of exported identifiers. */
  exportedNames: string[];
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
    /** Policy used for this audit (when provided). */
    policy?: Partial<RunAuditOptions>;
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
