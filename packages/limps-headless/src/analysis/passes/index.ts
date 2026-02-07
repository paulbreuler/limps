import * as fs from 'node:fs';
import * as ts from 'typescript';

import type { ComponentIR, Evidence, JsxEvidence, BehaviorEvidence } from '../ir/types.js';
import { extractImportEvidence } from './import-evidence.js';
import { extractJsxEvidence } from './jsx-evidence.js';
import { extractBehaviorEvidence } from './behavior-evidence.js';

export interface EvidenceContext {
  filePath: string;
  sourceText?: string;
}

export interface EvidenceBundle {
  evidence: Evidence[];
  jsx: JsxEvidence;
  behaviors: BehaviorEvidence;
}

export function collectEvidence(ir: ComponentIR, context: EvidenceContext): EvidenceBundle {
  const sourceText = context.sourceText ?? fs.readFileSync(context.filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(
    context.filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true
  );

  const importEvidence = extractImportEvidence(ir);
  const jsxResult = extractJsxEvidence(sourceFile);
  const behaviorResult = extractBehaviorEvidence(sourceFile, jsxResult.jsx);

  return {
    evidence: [...importEvidence, ...jsxResult.evidence, ...behaviorResult.evidence],
    jsx: jsxResult.jsx,
    behaviors: behaviorResult.behaviors,
  };
}

export { extractImportEvidence } from './import-evidence.js';
export { extractJsxEvidence } from './jsx-evidence.js';
export { extractBehaviorEvidence } from './behavior-evidence.js';
