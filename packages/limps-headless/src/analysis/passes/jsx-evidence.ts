import * as ts from 'typescript';
import type { Evidence, EvidenceLocation, JsxEvidence } from '../ir/types.js';

const ROLE_EVIDENCE = new Set([
  'alertdialog',
  'button',
  'checkbox',
  'columnheader',
  'combobox',
  'dialog',
  'grid',
  'gridcell',
  'img',
  'list',
  'listbox',
  'listitem',
  'menu',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'meter',
  'option',
  'progressbar',
  'radio',
  'row',
  'rowgroup',
  'rowheader',
  'scrollbar',
  'separator',
  'slider',
  'spinbutton',
  'status',
  'switch',
  'tab',
  'tablist',
  'tabpanel',
  'textbox',
  'tooltip',
  'tree',
  'treeitem',
]);

const DATA_ATTR_EVIDENCE = new Set([
  'data-active',
  'data-align',
  'data-checked',
  'data-closed',
  'data-current',
  'data-disabled',
  'data-expanded',
  'data-highlighted',
  'data-invalid',
  'data-motion',
  'data-open',
  'data-orientation',
  'data-placeholder',
  'data-pressed',
  'data-selected',
  'data-side',
  'data-state',
  'data-value',
]);

export interface JsxEvidenceResult {
  jsx: JsxEvidence;
  evidence: Evidence[];
}

function buildLocation(sourceFile: ts.SourceFile, node: ts.Node): EvidenceLocation {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return {
    file: sourceFile.fileName,
    line: pos.line + 1,
    column: pos.character + 1,
  };
}

function extractStringLiteral(initializer: ts.JsxAttributeValue | undefined): string | null {
  if (!initializer) return null;
  if (ts.isStringLiteral(initializer)) {
    return initializer.text;
  }
  if (ts.isJsxExpression(initializer) && initializer.expression) {
    if (ts.isStringLiteral(initializer.expression)) {
      return initializer.expression.text;
    }
  }
  return null;
}

function addEvidence(
  evidenceMap: Map<string, Evidence>,
  id: string,
  source: Evidence['source'],
  strength: Evidence['strength'],
  weight: number,
  location?: EvidenceLocation
) {
  if (evidenceMap.has(id)) return;
  evidenceMap.set(id, {
    id,
    source,
    strength,
    weight,
    location,
  });
}

export function extractJsxEvidence(sourceFile: ts.SourceFile): JsxEvidenceResult {
  const elements = new Set<string>();
  const attributes = new Set<string>();
  const roles = new Set<string>();
  const dataAttrs = new Set<string>();
  const evidenceMap = new Map<string, Evidence>();

  function handleJsxAttributes(attrs: ts.JsxAttributes) {
    for (const prop of attrs.properties) {
      if (!ts.isJsxAttribute(prop)) continue;
      const name = prop.name.getText();
      attributes.add(name);

      if (name === 'role') {
        const roleValue = extractStringLiteral(prop.initializer);
        if (roleValue) {
          roles.add(roleValue);
          if (ROLE_EVIDENCE.has(roleValue)) {
            addEvidence(
              evidenceMap,
              `role:${roleValue}`,
              'role',
              'possible',
              1,
              buildLocation(sourceFile, prop)
            );
          }
        }
      }

      if (name.startsWith('data-')) {
        dataAttrs.add(name);
        if (DATA_ATTR_EVIDENCE.has(name)) {
          addEvidence(
            evidenceMap,
            `data-attr:${name}`,
            'data-attr',
            'weak',
            1,
            buildLocation(sourceFile, prop)
          );
        }
      }

      if (name === 'asChild' || name === 'as-child') {
        addEvidence(
          evidenceMap,
          'attr:asChild',
          'jsx',
          'possible',
          1,
          buildLocation(sourceFile, prop)
        );
      }

      if (name === 'render') {
        addEvidence(evidenceMap, 'attr:render', 'jsx', 'weak', 1, buildLocation(sourceFile, prop));
      }
    }
  }

  function visit(node: ts.Node) {
    if (ts.isJsxOpeningElement(node)) {
      elements.add(node.tagName.getText());
      handleJsxAttributes(node.attributes);
    }

    if (ts.isJsxSelfClosingElement(node)) {
      elements.add(node.tagName.getText());
      handleJsxAttributes(node.attributes);
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    jsx: {
      elements: Array.from(elements),
      attributes: Array.from(attributes),
      roles: Array.from(roles),
      dataAttrs: Array.from(dataAttrs),
    },
    evidence: Array.from(evidenceMap.values()),
  };
}
