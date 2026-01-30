---
title: limps Headless Pivot Interfaces
tags: [limps/interfaces, limps/contract]
created: 2026-01-29
updated: 2026-01-29
---

# Interfaces - limps-headless-pivot

## Core Types

### Backend Identifier

```typescript
type HeadlessBackend = 'radix' | 'base' | 'mixed' | 'unknown';
```

### Component Inventory

```typescript
interface ComponentInventory {
  name: string;
  filePath: string;
  backend: HeadlessBackend;
  mixedUsage: boolean;

  // Evidence
  importSources: string[];          // matched import sources
  evidence: string[];               // e.g. ["asChild", "render"]

  // Structural metadata
  exportsComponent: boolean;
  exportedNames: string[];
  followReExports?: string[];

  // Analyzer metadata
  lineCount?: number;
  fileSize?: number;
  hasChildren?: boolean;
}
```

### Provider Interface

```typescript
interface BackendProvider {
  id: 'radix' | 'base';
  label: string;
  deprecated?: boolean;             // true for Radix legacy

  // Discovery hooks
  detectImports(imports: string[]): boolean;
  detectPatterns(evidence: string[]): boolean;

  // Rule evaluation
  analyzeComponent(component: ComponentInventory): Issue[];
  analyzeProject(components: ComponentInventory[]): Issue[];
}
```

### Audit Options

```typescript
type BackendMode = 'auto' | 'base' | 'radix-legacy';

type MigrationThreshold = 'low' | 'medium' | 'high';

interface RunAuditOptions {
  backendMode: BackendMode;
  migrationThreshold: MigrationThreshold;
  failOnMixed: boolean;
  includeLegacy: boolean;           // allow Radix when true
}
```

### Issue + Results

```typescript
interface Issue {
  component?: string;
  category: 'accessibility' | 'performance' | 'dependencies' | 'storybook' | 'migration';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  suggestion?: string;
  evidence?: string[];
}

interface AuditSummary {
  totalComponents: number;
  backendCounts: Record<HeadlessBackend, number>;
  legacyRadixCount: number;
  migrationReadiness: 'excellent' | 'good' | 'needs-work' | 'urgent';
}

interface AuditResult {
  inventory: ComponentInventory[];
  issues: Issue[];
  summary: AuditSummary;
}
```

### Report Output

```typescript
interface ReportOutput {
  format: 'markdown' | 'json';
  generatedAt: string;
  result: AuditResult;
}
```
