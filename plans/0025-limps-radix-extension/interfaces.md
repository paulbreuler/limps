---
title: limps Radix Extension Interfaces
tags: [limps/interfaces, limps/contract]
created: 2026-01-26
updated: 2026-01-27
---

# Interfaces - limps-radix-extension

## Core Types

### Extracted Primitive Contract

```typescript
/**
 * Raw extraction from Radix .d.ts files
 */
interface ExtractedPrimitive {
  name: string;                    // "Dialog", "Popover"
  package: string;                 // "@radix-ui/react-dialog"
  version: string;                 // "1.0.5"
  extractedAt: string;             // ISO timestamp
  
  rootProps: PropDefinition[];
  subComponents: SubComponentDefinition[];
  exports: string[];               // What's actually exported
  
  usesContext: boolean;
  contextShape?: PropDefinition[];
}

interface SubComponentDefinition {
  name: string;                    // "Root", "Trigger", "Content"
  props: PropDefinition[];
  isRequired: boolean;             // Must have Root? Must have Content?
}

interface PropDefinition {
  name: string;
  type: string;                    // TypeScript type as string
  required: boolean;
  defaultValue?: string;           // From JSDoc @default
  description?: string;            // From JSDoc comment
  
  // Semantic classification
  isStateControl: boolean;         // open, value, checked, pressed
  isEventHandler: boolean;         // onOpenChange, onValueChange
  isConfiguration: boolean;        // modal, orientation, side, align
  isComposition: boolean;          // asChild, children
}
```

### Behavior Signature

```typescript
/**
 * Semantic behavioral contract - what we compare components against
 */
interface BehaviorSignature {
  primitive: string;
  package: string;
  version: string;
  
  // Behavioral patterns
  statePattern: StatePattern;
  compositionPattern: CompositionPattern;
  renderingPattern: RenderingPattern;
  
  // Distinguishing characteristics
  distinguishingProps: string[];   // Props that identify this primitive
  antiPatternProps: string[];      // Props that indicate NOT this primitive
  
  // Sub-component structure
  subComponents: {
    name: string;
    role: 'trigger' | 'content' | 'overlay' | 'item' | 'indicator' | 'other';
    required: boolean;
  }[];
  
  // For disambiguation
  similarTo: string[];             // ["Popover", "HoverCard"]
  disambiguationRule?: string;     // Human-readable rule
}

type StatePattern = 
  | 'binary'        // open/closed (Dialog, Popover, Tooltip)
  | 'single-value'  // one selected (Select, RadioGroup)
  | 'multi-value'   // multiple selected (Checkbox group, ToggleGroup)
  | 'range'         // numeric range (Slider)
  | 'text'          // string input (forms)
  | 'none';         // stateless (Separator, AspectRatio)

type CompositionPattern =
  | 'monolithic'    // Single component (Checkbox, Switch)
  | 'compound'      // Root + Trigger + Content pattern
  | 'provider';     // Context provider only

type RenderingPattern =
  | 'inline'        // Renders in place
  | 'portal'        // Always portals (Tooltip, Toast)
  | 'conditional'   // Conditionally shows (Accordion items)
  | 'portal-conditional'; // Portals when open (Dialog, Popover)
```

### Analysis Results

```typescript
/**
 * Result of analyzing a local component
 */
interface ComponentAnalysis {
  name: string;
  filePath: string;
  
  // Extracted information
  propsInterface: Map<string, PropDefinition>;
  subComponents: string[];         // ComponentName.SubName pattern
  
  // Inferred patterns
  inferredStatePattern: StatePattern;
  inferredCompositionPattern: CompositionPattern;
  inferredRenderingPattern: RenderingPattern;
  
  // Detected features
  usesForwardRef: boolean;
  hasAsChild: boolean;
  ariaRoles: string[];
  dataAttributes: string[];        // data-state, data-orientation, etc.
}

/**
 * Match result with confidence scoring
 */
interface PrimitiveMatch {
  primitive: string;
  package: string;
  confidence: number;              // 0-100
  
  breakdown: {
    statePatternScore: number;     // max 35
    compositionScore: number;      // max 25
    propsSignatureScore: number;   // max 20
    accessibilityScore: number;    // max 10
    renderingScore: number;        // max 10
  };
  
  signals: {
    matched: string[];             // Props/patterns that matched
    missing: string[];             // Expected but not found
    antiPatterns: string[];        // Found props that indicate NOT this
  };
}

/**
 * Final recommendation
 */
interface AnalysisResult {
  component: string;
  filePath: string;
  
  recommendation: {
    primitive: string | null;
    package: string | null;
    confidence: number;
    action: 'ADOPT_RADIX' | 'CONSIDER_RADIX' | 'CUSTOM_OK';
    reason?: string;
  };
  
  matches: PrimitiveMatch[];       // All matches above threshold
  analysis: ComponentAnalysis;
  isAmbiguous: boolean;            // Top 2 within 10 points
}
```

### Diff Types

```typescript
/**
 * Change between two versions of a primitive
 */
interface RadixChange {
  primitive: string;
  changeType: RadixChangeType;
  severity: 'breaking' | 'warning' | 'info';
  
  target: string;                  // Prop name, sub-component name
  before?: string;                 // Previous value/type
  after?: string;                  // New value/type
  
  description: string;
  migrationHint?: string;
}

type RadixChangeType =
  // Breaking
  | 'prop_removed'
  | 'prop_required'                // Was optional, now required
  | 'subcomponent_removed'
  | 'type_narrowed'                // 'string | number' → 'string'
  
  // Warnings
  | 'prop_deprecated'
  | 'type_changed'
  | 'default_changed'
  
  // Info
  | 'prop_added'
  | 'subcomponent_added'
  | 'type_widened';                // 'string' → 'string | number'

/**
 * Full diff result
 */
interface RadixDiff {
  fromVersion: string;
  toVersion: string;
  hasBreakingChanges: boolean;
  
  summary: {
    totalChanges: number;
    breaking: number;
    warnings: number;
    info: number;
  };
  
  changes: RadixChange[];
  primitiveChanges: Map<string, RadixChange[]>;
}
```

### Cache Types

```typescript
/**
 * Cached extraction data
 */
interface RadixCache {
  version: string;
  extractedAt: string;
  ttlDays: number;
  
  primitives: Map<string, ExtractedPrimitive>;
  signatures: Map<string, BehaviorSignature>;
}

interface CacheConfig {
  cacheDir: string;                // Default: ".limps-radix"
  ttlDays: number;                 // Default: 7
  autoRefresh: boolean;            // Default: true
}
```

### Extension API (limps)

```typescript
/**
 * limps extension interface - TO BE ADDED TO LIMPS
 */
interface LimpsExtension {
  name: string;
  version: string;
  
  tools: Tool[];                   // MCP tools to register
  
  resources?: Resource[];          // Optional MCP resources
  
  onInit?(context: ExtensionContext): Promise<void>;
  onShutdown?(): Promise<void>;
}

interface ExtensionContext {
  dataDir: string;                 // Extension-specific data directory
  config: Record<string, unknown>; // Extension config from limps.config.json
  logger: Logger;
}

interface Logger {
  debug(msg: string): void;
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}
```

### MCP Tool Schemas

```typescript
// radix_list_primitives
interface ListPrimitivesInput {
  version?: string;                // Default: "latest"
}

interface ListPrimitivesOutput {
  version: string;
  primitives: {
    name: string;
    package: string;
    description?: string;
  }[];
}

// radix_extract_primitive
interface ExtractPrimitiveInput {
  primitive: string;               // Required
  version?: string;                // Default: "latest"
}

interface ExtractPrimitiveOutput {
  primitive: string;
  package: string;
  version: string;
  
  behavior: {
    statePattern: StatePattern;
    compositionPattern: CompositionPattern;
    renderingPattern: RenderingPattern;
  };
  
  subComponents: {
    name: string;
    props: {
      name: string;
      type: string;
      required: boolean;
      default?: string;
      category: 'state' | 'event' | 'config' | 'composition' | 'other';
    }[];
  }[];
  
  similarTo: string[];
  disambiguationRule?: string;
}

// radix_analyze_component
interface AnalyzeComponentInput {
  filePath: string;                // Required
  radixVersion?: string;           // Default: "latest"
  threshold?: number;              // Default: 40
}

// Output is AnalysisResult (defined above)

// radix_diff_versions
interface DiffVersionsInput {
  fromVersion: string;             // Required
  toVersion?: string;              // Default: "latest"
  primitives?: string[];           // Default: all
  breakingOnly?: boolean;          // Default: false
}

// Output is RadixDiff (defined above)

// radix_check_updates
interface CheckUpdatesInput {
  refreshCache?: boolean;          // Default: false
}

interface CheckUpdatesOutput {
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  
  diff?: RadixDiff;                // If hasUpdate, includes diff
}
```

## Provider Interface (Extensibility)

```typescript
/**
 * Interface for component library providers
 * Allows adding support for shadcn, Ark UI, etc.
 */
interface ComponentLibraryProvider {
  name: string;                    // "radix", "ark", "headless"
  displayName: string;             // "Radix UI", "Ark UI"
  
  // Package discovery
  listPrimitives(version: string): Promise<string[]>;
  resolveVersion(versionHint: string): Promise<string>;
  
  // Type fetching
  fetchTypes(primitive: string, version: string): Promise<string>;
  
  // Custom extraction logic (if needed)
  extract?(typeContent: string): ExtractedPrimitive;
  
  // Custom signature generation (if needed)  
  generateSignature?(extracted: ExtractedPrimitive): BehaviorSignature;
}

/**
 * Provider registry
 */
interface ProviderRegistry {
  register(provider: ComponentLibraryProvider): void;
  get(name: string): ComponentLibraryProvider | undefined;
  list(): string[];
  default: string;                 // "radix"
}
```

## Unified Package Support (Agent 007)

```typescript
/**
 * Package source detection for unified vs individual packages
 */
export type PackageSource = 'individual' | 'unified';

export interface ResolvedPackage {
  source: PackageSource;
  packageName: string;
  primitive: string;
  version: string;
  typesPath: string;
}

export async function detectPackageSource(primitive: string): Promise<PackageSource>;
export async function resolvePackage(primitive: string, versionHint: string): Promise<ResolvedPackage>;
```

## Complex Type Parsing (Agent 008)

```typescript
/**
 * ForwardRef and type alias resolution
 */
export function extractPropsFromForwardRef(
  decl: TypeAliasDeclaration | VariableDeclaration
): RawProp[] | null;

export function resolveTypeAlias(
  sourceFile: SourceFile,
  aliasName: string
): InterfaceDeclaration | TypeLiteralNode | null;

export function mergeIntersectionTypes(types: Type[]): RawProp[];

export function filterReactInternals(props: RawProp[]): RawProp[];
```

## Audit Report Pipeline (Agent 009)

```typescript
// radix_run_audit
interface RunAuditInput {
  scope?: {
    files?: string[];
    primitives?: string[];
    provider?: string;           // Default: "radix"
  };
  radixVersion?: string;         // Default: "latest"
  outputDir?: string;            // Default: ".limps-radix/reports"
  format?: 'json' | 'markdown' | 'both';
}

// radix_generate_report
interface GenerateReportInput {
  inputs: {
    analysis: string;            // Path to analysis JSON
    diff?: string;               // Optional path to diff JSON
    checkUpdates?: string;       // Optional path to update JSON
  };
  outputDir?: string;
  format?: 'json' | 'markdown' | 'both';
  title?: string;
}

interface AuditReport {
  metadata: {
    version: string;
    generatedAt: string;
    generatedBy: string;
  };
  summary: {
    totalComponents: number;
    issuesByPriority: Record<'critical'|'high'|'medium'|'low', number>;
    contraventions: number;
  };
  contraventions: {
    id: string;
    type: string;                // legacy-package-usage, non-tree-shaking, etc.
    severity: 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
    location?: string;
  }[];
  issues: {
    id: string;
    category: string;
    priority: 'critical' | 'high' | 'medium' | 'low';
    description: string;
    recommendation: string;
    location?: string;
  }[];
  recommendations: string[];
}
```

Report files (when format is `both`):
- `AUDIT_REPORT.md`
- `audit-report.json`
- `summary.json`

## External Dependencies

```typescript
// ts-morph - Type extraction
import { Project, SourceFile, InterfaceDeclaration, Type, TypeAliasDeclaration, VariableDeclaration, TypeLiteralNode } from 'ts-morph';

// MCP SDK
import { Tool, Resource } from '@modelcontextprotocol/sdk/types.js';

// limps (peer dependency)
import { LimpsExtension, ExtensionContext } from '@sudosandwich/limps';
```
