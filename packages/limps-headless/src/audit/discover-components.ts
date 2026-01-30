/**
 * Discover React components in a project and return metadata.
 * Agent 1 #1: Unified Component Discovery with backend detection.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import type { ComponentMetadata, DiscoveryOptions, HeadlessBackend } from './types.js';

/** Import patterns for Radix UI packages. */
const RADIX_IMPORT_PATTERNS = [
  /^@radix-ui\/react-/,
  /^@radix-ui\/primitive/,
];

/** Import patterns for Base UI packages. */
const BASE_IMPORT_PATTERNS = [
  /^@base-ui-components\//,
  /^@base_ui\//,
];

/** JSX attribute patterns that indicate Radix usage. */
const RADIX_EVIDENCE_PATTERNS = ['asChild'];

/** JSX attribute patterns that indicate Base UI usage. */
const BASE_EVIDENCE_PATTERNS = ['render'];

const DEFAULT_OPTIONS: Required<DiscoveryOptions> = {
  rootDir: 'src/components',
  includePatterns: ['**/*.tsx', '**/*.jsx'],
  excludePatterns: ['**/*.test.*', '**/*.stories.*', '**/*.spec.*'],
};

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function globToRegExp(glob: string): RegExp {
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '(?:.*/)?')
    .replace(/\*\*/g, '.*')
    .replace(/\*/g, '[^/]*');
  return new RegExp(`^${escaped}$`);
}

function matchesAny(pathValue: string, patterns: string[]): boolean {
  if (patterns.length === 0) return false;
  return patterns.some((pattern) => globToRegExp(pattern).test(pathValue));
}

function extractComponentName(sourceFile: ts.SourceFile, filePath: string): string {
  let name: string | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isExportAssignment(node) && node.isExportEquals === false) {
      if (ts.isIdentifier(node.expression)) {
        name = node.expression.text;
      }
    }

    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (ts.isIdentifier(decl.name)) {
          name = decl.name.text;
        }
      }
    }

    if (
      ts.isFunctionDeclaration(node) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (node.name) {
        name = node.name.text;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (!name) {
    name = path.basename(filePath, path.extname(filePath));
  }

  return name;
}

function detectExportType(sourceFile: ts.SourceFile): ComponentMetadata['exportType'] {
  let hasDefault = false;
  let hasNamed = false;

  const visit = (node: ts.Node): void => {
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      hasDefault = true;
    }
    if (ts.isExportDeclaration(node) && !node.exportClause) {
      hasDefault = true;
    }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      hasNamed = true;
    }
    if (
      (ts.isVariableStatement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword)) {
        hasDefault = true;
      } else {
        hasNamed = true;
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  if (hasDefault && hasNamed) return 'both';
  if (hasDefault) return 'default';
  if (hasNamed) return 'named';
  return undefined;
}

function extractPropsInterface(sourceFile: ts.SourceFile): string | undefined {
  let propsInterface: string | undefined;

  const visit = (node: ts.Node): void => {
    if (ts.isInterfaceDeclaration(node) || ts.isTypeAliasDeclaration(node)) {
      const name = node.name.text;
      if (name.endsWith('Props') || name.endsWith('Prop')) {
        propsInterface = name;
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return propsInterface;
}

function extractDependencies(sourceFile: ts.SourceFile): string[] {
  const dependencies = new Set<string>();

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const clause = node.importClause;
      if (clause?.namedBindings && ts.isNamedImports(clause.namedBindings)) {
        clause.namedBindings.elements.forEach((element) => {
          const name = element.name.text;
          if (name[0] && name[0] === name[0].toUpperCase()) {
            dependencies.add(name);
          }
        });
      }
      if (clause?.name) {
        const name = clause.name.text;
        if (name[0] && name[0] === name[0].toUpperCase()) {
          dependencies.add(name);
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);

  return [...dependencies];
}

/**
 * Extract all import sources from a source file (Agent 1 #1).
 */
function extractImportSources(sourceFile: ts.SourceFile): string[] {
  const sources: string[] = [];

  const visit = (node: ts.Node): void => {
    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      sources.push(node.moduleSpecifier.text);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return sources;
}

/**
 * Check if an import source matches Radix patterns.
 */
function isRadixImport(source: string): boolean {
  return RADIX_IMPORT_PATTERNS.some((pattern) => pattern.test(source));
}

/**
 * Check if an import source matches Base UI patterns.
 */
function isBaseImport(source: string): boolean {
  return BASE_IMPORT_PATTERNS.some((pattern) => pattern.test(source));
}

/**
 * Extract JSX attribute evidence for backend detection (Agent 1 #1).
 * Scans for attributes like asChild (Radix) and render (Base).
 */
function extractPatternEvidence(sourceFile: ts.SourceFile): string[] {
  const evidence = new Set<string>();

  const visit = (node: ts.Node): void => {
    // Check JSX attributes
    if (ts.isJsxAttribute(node) && ts.isIdentifier(node.name)) {
      const attrName = node.name.text;
      // Check for Radix patterns
      if (RADIX_EVIDENCE_PATTERNS.includes(attrName)) {
        evidence.add(attrName);
      }
      // Check for Base patterns - but only if it's a render prop (has JSX element or function value)
      if (BASE_EVIDENCE_PATTERNS.includes(attrName)) {
        // Avoid false positives: only count 'render' if it looks like a render prop
        if (node.initializer) {
          if (
            ts.isJsxExpression(node.initializer) ||
            (ts.isStringLiteral(node.initializer) === false)
          ) {
            evidence.add(attrName);
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return [...evidence];
}

/**
 * Extract exported names from a source file (Agent 1 #1).
 */
function extractExportedNames(sourceFile: ts.SourceFile): string[] {
  const names: string[] = [];

  const visit = (node: ts.Node): void => {
    // export default X
    if (ts.isExportAssignment(node) && !node.isExportEquals) {
      if (ts.isIdentifier(node.expression)) {
        names.push(node.expression.text);
      } else {
        names.push('default');
      }
    }

    // export const X = ..., export function X, export class X
    if (
      (ts.isVariableStatement(node) ||
        ts.isFunctionDeclaration(node) ||
        ts.isClassDeclaration(node)) &&
      node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      if (ts.isVariableStatement(node)) {
        for (const decl of node.declarationList.declarations) {
          if (ts.isIdentifier(decl.name)) {
            names.push(decl.name.text);
          }
        }
      } else if (node.name) {
        names.push(node.name.text);
      }
    }

    // export { X, Y }
    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        names.push(element.name.text);
      }
    }

    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return names;
}

/**
 * Determine if the component exports a React component (Agent 1 #1).
 * Heuristic: exports something that starts with uppercase letter.
 */
function detectExportsComponent(exportedNames: string[]): boolean {
  return exportedNames.some((name) => {
    if (name === 'default') return true;
    return name[0] === name[0].toUpperCase();
  });
}

/**
 * Determine backend from import sources and evidence (Agent 1 #1).
 */
function determineBackend(
  importSources: string[],
  evidence: string[]
): { backend: HeadlessBackend; mixedUsage: boolean; matchedImports: string[] } {
  const radixImports = importSources.filter(isRadixImport);
  const baseImports = importSources.filter(isBaseImport);

  const hasRadixImports = radixImports.length > 0;
  const hasBaseImports = baseImports.length > 0;

  // Evidence-based detection (secondary signal)
  const hasRadixEvidence = evidence.some((e) => RADIX_EVIDENCE_PATTERNS.includes(e));
  const hasBaseEvidence = evidence.some((e) => BASE_EVIDENCE_PATTERNS.includes(e));

  // Mixed usage: both backends detected
  if ((hasRadixImports && hasBaseImports) || (hasRadixImports && hasBaseEvidence) || (hasBaseImports && hasRadixEvidence)) {
    return {
      backend: 'mixed',
      mixedUsage: true,
      matchedImports: [...radixImports, ...baseImports],
    };
  }

  // Radix only
  if (hasRadixImports || hasRadixEvidence) {
    return {
      backend: 'radix',
      mixedUsage: false,
      matchedImports: radixImports,
    };
  }

  // Base only
  if (hasBaseImports || hasBaseEvidence) {
    return {
      backend: 'base',
      mixedUsage: false,
      matchedImports: baseImports,
    };
  }

  // Unknown
  return {
    backend: 'unknown',
    mixedUsage: false,
    matchedImports: [],
  };
}

async function walkFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.promises.readdir(rootDir, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkFiles(fullPath)));
    } else if (entry.isFile()) {
      results.push(fullPath);
    }
  }

  return results;
}

export async function discoverComponents(
  options: DiscoveryOptions = {}
): Promise<ComponentMetadata[]> {
  const opts: Required<DiscoveryOptions> = { ...DEFAULT_OPTIONS, ...options };
  const rootDir = path.resolve(process.cwd(), opts.rootDir);

  if (!fs.existsSync(rootDir)) {
    console.warn(`[discover-components] Root directory not found: ${rootDir}`);
    return [];
  }

  const includePatterns = opts.includePatterns.map(normalizePath);
  const excludePatterns = opts.excludePatterns.map(normalizePath);
  const files = await walkFiles(rootDir);
  const results: ComponentMetadata[] = [];

  for (const filePath of files) {
    const normalized = normalizePath(path.relative(rootDir, filePath));
    if (!matchesAny(normalized, includePatterns)) continue;
    if (matchesAny(normalized, excludePatterns)) continue;

    const content = fs.readFileSync(filePath, 'utf-8');
    const sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true,
      filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
    );

    const name = extractComponentName(sourceFile, filePath);
    const importSources = extractImportSources(sourceFile);
    const evidence = extractPatternEvidence(sourceFile);
    const exportedNames = extractExportedNames(sourceFile);
    const { backend, mixedUsage, matchedImports } = determineBackend(importSources, evidence);

    results.push({
      path: normalizePath(path.relative(process.cwd(), filePath)),
      name,
      exportType: detectExportType(sourceFile),
      propsInterface: extractPropsInterface(sourceFile),
      dependencies: extractDependencies(sourceFile),
      backend,
      mixedUsage,
      importSources: matchedImports,
      evidence,
      exportsComponent: detectExportsComponent(exportedNames),
      exportedNames,
    });
  }

  return results;
}
