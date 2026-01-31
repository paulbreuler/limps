import * as ts from 'typescript';
import type { BehaviorEvidence, Evidence } from '../ir/types.js';
import type { JsxEvidence } from '../ir/types.js';
import type { EvidenceLocation } from '../ir/types.js';

export interface BehaviorEvidenceResult {
  behaviors: BehaviorEvidence;
  evidence: Evidence[];
}

const ROVING_ROLES = new Set([
  'grid',
  'listbox',
  'menu',
  'menubar',
  'radiogroup',
  'tablist',
  'toolbar',
  'tree',
]);

function buildLocation(sourceFile: ts.SourceFile, node: ts.Node): EvidenceLocation {
  const pos = sourceFile.getLineAndCharacterOfPosition(node.getStart());
  return {
    file: sourceFile.fileName,
    line: pos.line + 1,
    column: pos.character + 1,
  };
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

export function extractBehaviorEvidence(
  sourceFile: ts.SourceFile,
  jsxEvidence: JsxEvidence
): BehaviorEvidenceResult {
  const behaviors = new Set<string>();
  const handlers = new Set<string>();
  const evidenceMap = new Map<string, Evidence>();

  const attributeSet = new Set(jsxEvidence.attributes);
  const tabIndexPresent =
    attributeSet.has('tabIndex') || attributeSet.has('tabindex');
  const hasRovingRole = jsxEvidence.roles.some((role) => ROVING_ROLES.has(role));
  const keyHandlerNames = ['onKeyDown', 'onKeyUp', 'onKeyPress'];
  const focusHandlerNames = ['onFocus', 'onBlur'];

  for (const handler of keyHandlerNames) {
    if (attributeSet.has(handler)) {
      handlers.add(handler);
    }
  }

  for (const handler of focusHandlerNames) {
    if (attributeSet.has(handler)) {
      handlers.add(handler);
    }
  }

  if (tabIndexPresent && handlers.size > 0 && hasRovingRole) {
    behaviors.add('roving-tabindex');
  }

  function visit(node: ts.Node) {
    if (ts.isCallExpression(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr) && expr.text === 'createPortal') {
        behaviors.add('portal');
        addEvidence(
          evidenceMap,
          'behavior:portal',
          'behavior',
          'possible',
          2,
          buildLocation(sourceFile, node)
        );
      }
      if (
        ts.isPropertyAccessExpression(expr) &&
        expr.name.text === 'createPortal'
      ) {
        behaviors.add('portal');
        addEvidence(
          evidenceMap,
          'behavior:portal',
          'behavior',
          'possible',
          2,
          buildLocation(sourceFile, node)
        );
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  if (behaviors.has('roving-tabindex')) {
    addEvidence(
      evidenceMap,
      'behavior:roving-tabindex',
      'behavior',
      'possible',
      2
    );
  }

  return {
    behaviors: {
      behaviors: Array.from(behaviors),
      handlers: Array.from(handlers),
    },
    evidence: Array.from(evidenceMap.values()),
  };
}
