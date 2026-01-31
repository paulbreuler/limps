/**
 * Component analyzer main module.
 * Analyzes local React components and matches them against Radix signatures.
 */

import type { ComponentAnalysis } from '../types/index.js';
import type { ModuleGraph } from '../analysis/module-graph.js';
import { buildComponentIr } from '../analysis/ir/build-ir.js';
import { collectEvidence } from '../analysis/passes/index.js';
import { parseComponent, getComponentNameFromPath } from './parser.js';
import { extractProps } from './props.js';
import {
  detectSubComponents,
  detectForwardRef,
  detectAsChild,
  detectAriaRoles,
  detectDataAttributes,
  inferStatePatternFromProps,
  inferCompositionPatternFromSubComponents,
  inferRenderingPatternFromAnalysis,
} from './patterns.js';
import { scoreAgainstSignatures } from './scorer.js';
import { disambiguate, isAmbiguous } from './disambiguator.js';

/**
 * Analyze a component file and return ComponentAnalysis.
 */
export interface AnalyzeComponentOptions {
  moduleGraph?: ModuleGraph;
}

export async function analyzeComponent(
  filePath: string,
  options: AnalyzeComponentOptions = {}
): Promise<ComponentAnalysis> {
  // Parse the component file
  const sourceFile = parseComponent(filePath);
  if (!sourceFile) {
    throw new Error(`Failed to parse component file: ${filePath}`);
  }

  // Get component name
  const componentName = getComponentNameFromPath(filePath);
  const sourceText = sourceFile.getFullText();

  // Extract props
  const propsInterface = extractProps(sourceFile, componentName);

  // Detect sub-components
  const subComponents = detectSubComponents(sourceFile, componentName);

  // Infer patterns
  const inferredStatePattern = inferStatePatternFromProps(propsInterface);
  const inferredCompositionPattern =
    inferCompositionPatternFromSubComponents(subComponents);
  const inferredRenderingPattern = inferRenderingPatternFromAnalysis(
    subComponents,
    propsInterface
  );

  // Detect features
  const usesForwardRef = detectForwardRef(sourceFile);
  const hasAsChild = detectAsChild(sourceFile, propsInterface);
  const ariaRoles = detectAriaRoles(sourceFile);
  const dataAttributes = detectDataAttributes(sourceFile);

  const ir = buildComponentIr({
    filePath,
    sourceText,
    moduleGraph: options.moduleGraph,
  });
  const evidenceBundle = collectEvidence(ir, { filePath, sourceText });
  ir.jsx = evidenceBundle.jsx;
  ir.behaviors = evidenceBundle.behaviors;
  ir.evidence = evidenceBundle.evidence;

  return {
    name: componentName,
    filePath,
    propsInterface,
    subComponents,
    inferredStatePattern,
    inferredCompositionPattern,
    inferredRenderingPattern,
    usesForwardRef,
    hasAsChild,
    ariaRoles,
    dataAttributes,
    ir,
  };
}

/**
 * Score component analysis against Radix signatures.
 * Re-exported from scorer module.
 */
export { scoreAgainstSignatures };

/**
 * Disambiguate ambiguous matches.
 * Re-exported from disambiguator module.
 */
export { disambiguate, isAmbiguous };
