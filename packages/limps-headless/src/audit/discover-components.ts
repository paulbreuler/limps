/**
 * Discover React components in a project and return metadata.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';
import type { ComponentMetadata, DiscoveryOptions } from './types.js';

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
    results.push({
      path: normalizePath(path.relative(process.cwd(), filePath)),
      name,
      exportType: detectExportType(sourceFile),
      propsInterface: extractPropsInterface(sourceFile),
      dependencies: extractDependencies(sourceFile),
    });
  }

  return results;
}
