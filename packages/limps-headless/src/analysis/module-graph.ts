import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

import { createTsCompilerContext } from './ts-program.js';

export interface ModuleGraphInput {
  tsconfigPath?: string;
  cwd?: string;
  rootDir?: string;
}

export interface ModuleGraphNode {
  filePath: string;
  imports: string[];
  resolvedImports: string[];
  reexports: string[];
  resolvedReexports: string[];
}

export interface ModuleGraph {
  addFile(filePath: string, sourceText?: string): ModuleGraphNode;
  getNode(filePath: string): ModuleGraphNode | undefined;
  resolveImport(specifier: string, fromFile: string): string | null;
  getAll(): ModuleGraphNode[];
}

function isWithinRoot(filePath: string, rootDir?: string): boolean {
  if (!rootDir) {
    return true;
  }
  const relative = path.relative(rootDir, filePath);
  return !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

function collectSpecifiers(sourceFile: ts.SourceFile): {
  imports: string[];
  reexports: string[];
} {
  const imports: string[] = [];
  const reexports: string[] = [];

  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      if (ts.isStringLiteral(statement.moduleSpecifier)) {
        imports.push(statement.moduleSpecifier.text);
      }
    }

    if (ts.isExportDeclaration(statement)) {
      if (statement.moduleSpecifier && ts.isStringLiteral(statement.moduleSpecifier)) {
        reexports.push(statement.moduleSpecifier.text);
      }
    }
  }

  return { imports, reexports };
}

export function createModuleGraph(input: ModuleGraphInput = {}): ModuleGraph {
  const cwd = input.cwd ?? process.cwd();
  const rootDir = input.rootDir ?? cwd;
  const compilerContext = createTsCompilerContext({
    tsconfigPath: input.tsconfigPath,
    cwd,
  });

  const nodes = new Map<string, ModuleGraphNode>();

  function resolveImport(specifier: string, fromFile: string): string | null {
    const resolved = ts.resolveModuleName(
      specifier,
      fromFile,
      compilerContext.compilerOptions,
      compilerContext.host
    );

    const resolvedModule = resolved.resolvedModule;
    if (!resolvedModule) {
      return null;
    }

    if (resolvedModule.isExternalLibraryImport) {
      return null;
    }

    const resolvedPath = normalizePath(resolvedModule.resolvedFileName);
    if (resolvedPath.includes('node_modules')) {
      return null;
    }

    if (!isWithinRoot(resolvedPath, rootDir)) {
      return null;
    }

    return resolvedPath;
  }

  function addFile(filePath: string, sourceText?: string): ModuleGraphNode {
    const normalized = normalizePath(filePath);
    const existing = nodes.get(normalized);
    if (existing) {
      return existing;
    }

    const text = sourceText ?? fs.readFileSync(normalized, 'utf-8');
    const sourceFile = ts.createSourceFile(
      normalized,
      text,
      ts.ScriptTarget.Latest,
      true
    );
    const { imports, reexports } = collectSpecifiers(sourceFile);

    const resolvedImports: string[] = [];
    for (const specifier of imports) {
      const resolvedPath = resolveImport(specifier, normalized);
      if (resolvedPath) {
        resolvedImports.push(resolvedPath);
      }
    }

    const resolvedReexports: string[] = [];
    for (const specifier of reexports) {
      const resolvedPath = resolveImport(specifier, normalized);
      if (resolvedPath) {
        resolvedReexports.push(resolvedPath);
      }
    }

    const node: ModuleGraphNode = {
      filePath: normalized,
      imports,
      resolvedImports,
      reexports,
      resolvedReexports,
    };

    nodes.set(normalized, node);
    return node;
  }

  function getNode(filePath: string): ModuleGraphNode | undefined {
    return nodes.get(normalizePath(filePath));
  }

  function getAll(): ModuleGraphNode[] {
    return Array.from(nodes.values());
  }

  return {
    addFile,
    getNode,
    resolveImport,
    getAll,
  };
}
