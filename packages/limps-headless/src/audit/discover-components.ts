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
  /^radix-ui$/,
  /^radix-ui\//,
];

/** Import patterns for Base UI packages. */
const BASE_IMPORT_PATTERNS = [
  /^@base-ui\/react/,
  /^@base-ui\//,
  /^@base-ui-components\//,
  /^@base_ui\//,
];

/** JSX attribute patterns that indicate Radix usage. */
const RADIX_EVIDENCE_PATTERNS = ['asChild'];

/** JSX role values that map to headless primitives (Base UI overlap). */
const BASE_ROLE_EVIDENCE = new Set([
  'alertdialog',
  'checkbox',
  'combobox',
  'dialog',
  'listbox',
  'menu',
  'menubar',
  'menuitem',
  'option',
  'radio',
  'radiogroup',
  'slider',
  'switch',
  'tab',
  'tablist',
  'tabpanel',
  'tooltip',
]);

/** JSX attribute patterns that indicate Base UI usage. */
const BASE_EVIDENCE_PATTERNS = [
  'render',
  ...Array.from(BASE_ROLE_EVIDENCE).map((role) => `role:${role}`),
];

const DEFAULT_OPTIONS: Required<DiscoveryOptions> = {
  rootDir: 'src/components',
  includePatterns: ['**/*.tsx', '**/*.jsx'],
  excludePatterns: ['**/*.test.*', '**/*.stories.*', '**/*.spec.*'],
};

function normalizePath(value: string): string {
  return value.replace(/\\/g, '/');
}

function globToRegExp(glob: string): RegExp {
  const globstarSlash = '__GLOBSTAR_SLASH__';
  const globstar = '__GLOBSTAR__';
  const star = '__STAR__';

  const escaped = glob
    .replace(/\*\*\//g, globstarSlash)
    .replace(/\*\*/g, globstar)
    .replace(/\*/g, star)
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(new RegExp(globstarSlash, 'g'), '(?:.*/)?')
    .replace(new RegExp(globstar, 'g'), '.*')
    .replace(new RegExp(star, 'g'), '[^/]*');
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
            ts.isStringLiteral(node.initializer) === false
          ) {
            evidence.add(attrName);
          }
        }
      }

      if (attrName === 'role' && node.initializer) {
        let roleValue: string | undefined;
        if (ts.isStringLiteral(node.initializer)) {
          roleValue = node.initializer.text;
        } else if (
          ts.isJsxExpression(node.initializer) &&
          node.initializer.expression &&
          ts.isStringLiteral(node.initializer.expression)
        ) {
          roleValue = node.initializer.expression.text;
        }

        if (roleValue) {
          const normalized = roleValue.toLowerCase();
          if (BASE_ROLE_EVIDENCE.has(normalized)) {
            evidence.add(`role:${normalized}`);
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
  if (
    (hasRadixImports && hasBaseImports) ||
    (hasRadixImports && hasBaseEvidence) ||
    (hasBaseImports && hasRadixEvidence)
  ) {
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

function resolveLocalImport(fromFilePath: string, specifier: string): string | undefined {
  const cwd = process.cwd();
  let basePath: string | undefined;

  if (specifier.startsWith('@/')) {
    basePath = path.join(cwd, 'src', specifier.slice(2));
  } else if (specifier.startsWith('./') || specifier.startsWith('../')) {
    basePath = path.resolve(path.dirname(fromFilePath), specifier);
  } else {
    return undefined;
  }

  if (basePath.endsWith('.ts') || basePath.endsWith('.tsx')) {
    return fs.existsSync(basePath) ? basePath : undefined;
  }

  for (const ext of ['.ts', '.tsx']) {
    const withExt = `${basePath}${ext}`;
    if (fs.existsSync(withExt)) return withExt;
  }

  if (fs.existsSync(basePath) && fs.statSync(basePath).isDirectory()) {
    for (const ext of ['.ts', '.tsx']) {
      const indexPath = path.join(basePath, `index${ext}`);
      if (fs.existsSync(indexPath)) return indexPath;
    }
  }

  return undefined;
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
  const fileInfoByPath = new Map<
    string,
    {
      filePath: string;
      relativePath: string;
      sourceFile: ts.SourceFile;
      importSources: string[];
      evidence: string[];
      exportedNames: string[];
    }
  >();

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

    const importSources = extractImportSources(sourceFile);
    const evidence = extractPatternEvidence(sourceFile);
    const exportedNames = extractExportedNames(sourceFile);

    fileInfoByPath.set(filePath, {
      filePath,
      relativePath: normalizePath(path.relative(process.cwd(), filePath)),
      sourceFile,
      importSources,
      evidence,
      exportedNames,
    });
  }

  const directBackendByPath = new Map<string, HeadlessBackend>();
  const matchedImportsByPath = new Map<string, string[]>();

  for (const info of fileInfoByPath.values()) {
    const { backend, matchedImports } = determineBackend(info.importSources, info.evidence);
    directBackendByPath.set(info.filePath, backend);
    matchedImportsByPath.set(info.filePath, matchedImports);
  }

  const inferredBackendByPath = new Map<string, HeadlessBackend>();
  const visiting = new Set<string>();

  const inferBackend = (filePath: string): HeadlessBackend => {
    const cached = inferredBackendByPath.get(filePath);
    if (cached) return cached;
    if (visiting.has(filePath)) return 'unknown';
    visiting.add(filePath);

    const direct = directBackendByPath.get(filePath) ?? 'unknown';
    let hasBase = direct === 'base' || direct === 'mixed';
    let hasRadix = direct === 'radix' || direct === 'mixed';

    const info = fileInfoByPath.get(filePath);
    if (info) {
      for (const specifier of info.importSources) {
        const resolved = resolveLocalImport(info.filePath, specifier);
        if (!resolved || !fileInfoByPath.has(resolved)) continue;
        const depBackend = inferBackend(resolved);
        if (depBackend === 'base' || depBackend === 'mixed') hasBase = true;
        if (depBackend === 'radix' || depBackend === 'mixed') hasRadix = true;
      }
    }

    visiting.delete(filePath);

    let result: HeadlessBackend = 'unknown';
    if (hasBase && hasRadix) result = 'mixed';
    else if (hasBase) result = 'base';
    else if (hasRadix) result = 'radix';

    inferredBackendByPath.set(filePath, result);
    return result;
  };

  for (const info of fileInfoByPath.values()) {
    const backend = inferBackend(info.filePath);
    const name = extractComponentName(info.sourceFile, info.filePath);
    const matchedImports = matchedImportsByPath.get(info.filePath) ?? [];
    results.push({
      path: info.relativePath,
      name,
      exportType: detectExportType(info.sourceFile),
      propsInterface: extractPropsInterface(info.sourceFile),
      dependencies: extractDependencies(info.sourceFile),
      backend,
      mixedUsage: backend === 'mixed',
      importSources: matchedImports,
      evidence: info.evidence,
      exportsComponent: detectExportsComponent(info.exportedNames),
      exportedNames: info.exportedNames,
    });
  }

  return results;
}
