import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

import type { ComponentIR, ImportSpec } from './types.js';
import type { ModuleGraph } from '../module-graph.js';

export interface BuildIrInput {
  filePath: string;
  sourceText?: string;
  exportName?: string;
  moduleGraph?: ModuleGraph;
}

function collectImportSpec(node: ts.ImportDeclaration): ImportSpec {
  const clause = node.importClause;
  const named: string[] = [];
  let defaultName: string | undefined;
  let namespace: string | undefined;

  if (clause) {
    if (clause.name) {
      defaultName = clause.name.text;
    }
    if (clause.namedBindings) {
      if (ts.isNamespaceImport(clause.namedBindings)) {
        namespace = clause.namedBindings.name.text;
      } else if (ts.isNamedImports(clause.namedBindings)) {
        for (const element of clause.namedBindings.elements) {
          named.push(element.name.text);
        }
      }
    }
  }

  return {
    source: node.moduleSpecifier.getText().slice(1, -1),
    named,
    defaultName,
    namespace,
  };
}

function deriveExportName(sourceFile: ts.SourceFile, filePath: string): string {
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.modifiers) {
      const isExported = statement.modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported && statement.name) {
        return statement.name.text;
      }
    }

    if (ts.isClassDeclaration(statement) && statement.modifiers) {
      const isExported = statement.modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported && statement.name) {
        return statement.name.text;
      }
    }

    if (ts.isVariableStatement(statement) && statement.modifiers) {
      const isExported = statement.modifiers.some(
        (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
      );
      if (isExported) {
        const decl = statement.declarationList.declarations[0];
        if (decl && ts.isIdentifier(decl.name)) {
          return decl.name.text;
        }
      }
    }

    if (ts.isExportAssignment(statement)) {
      if (ts.isIdentifier(statement.expression)) {
        return statement.expression.text;
      }
    }
  }

  return path.basename(filePath, path.extname(filePath));
}

export function buildComponentIr(input: BuildIrInput): ComponentIR {
  const sourceText = input.sourceText ?? fs.readFileSync(input.filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(input.filePath, sourceText, ts.ScriptTarget.Latest, true);

  const imports: ImportSpec[] = [];
  for (const statement of sourceFile.statements) {
    if (ts.isImportDeclaration(statement)) {
      imports.push(collectImportSpec(statement));
    }
  }

  const exportName = input.exportName ?? deriveExportName(sourceFile, input.filePath);
  const localName = exportName;
  const id = `${input.filePath}#${exportName}`;

  let dependencies: string[] = [];
  let reexports: string[] = [];
  if (input.moduleGraph) {
    const node = input.moduleGraph.addFile(input.filePath, sourceText);
    dependencies = node.resolvedImports.slice();
    reexports = node.resolvedReexports.slice();
  }

  return {
    id,
    filePath: input.filePath,
    exportName,
    localName,
    imports,
    jsx: {
      elements: [],
      attributes: [],
      roles: [],
      dataAttrs: [],
    },
    behaviors: {
      behaviors: [],
      handlers: [],
    },
    evidence: [],
    dependencies,
    reexports,
  };
}
