/**
 * Interface extraction from TypeScript source files.
 */

import type { SourceFile, InterfaceDeclaration } from 'ts-morph';
import type { SubComponentDefinition, ExtractedPrimitive, PropDefinition } from '../types/index.js';
import { extractPropsFromInterface, isPropsInterface } from './props.js';
import { classifyProp } from './classifier.js';
import {
  findForwardRefDeclarations,
  extractPropsFromForwardRef,
  getSubComponentSuffix,
} from './forward-ref.js';
import { filterReactInternals } from './type-resolver.js';

/**
 * Pattern for Radix sub-component naming.
 * @example "DialogRoot", "DialogContent", "DialogTrigger"
 */
const SUB_COMPONENT_PATTERN =
  /^([A-Z][a-z]+)(Root|Trigger|Content|Title|Description|Close|Overlay|Portal|Arrow|Item|Indicator|Thumb|Track|Range|Viewport|Scrollbar|Corner|Action|Cancel|Group|Label|Separator|Sub|List|Value|Icon|Image|Fallback)Props$/;

/**
 * Required sub-components by primitive type.
 */
const REQUIRED_SUB_COMPONENTS: Record<string, string[]> = {
  Dialog: ['Root', 'Trigger', 'Content'],
  AlertDialog: ['Root', 'Trigger', 'Content', 'Action', 'Cancel'],
  Popover: ['Root', 'Trigger', 'Content'],
  Tooltip: ['Root', 'Trigger', 'Content'],
  DropdownMenu: ['Root', 'Trigger', 'Content'],
  ContextMenu: ['Root', 'Trigger', 'Content'],
  Select: ['Root', 'Trigger', 'Value', 'Content'],
  Tabs: ['Root', 'List', 'Trigger', 'Content'],
  Accordion: ['Root', 'Item', 'Trigger', 'Content'],
};

/**
 * Find all interfaces in a source file.
 */
export function findInterfaces(sourceFile: SourceFile): InterfaceDeclaration[] {
  return sourceFile.getInterfaces();
}

/**
 * Find props interfaces (names ending with "Props").
 */
export function findPropsInterfaces(sourceFile: SourceFile): InterfaceDeclaration[] {
  return sourceFile.getInterfaces().filter((i) => isPropsInterface(i.getName()));
}

/**
 * Extract sub-components from props interfaces.
 */
export function extractSubComponents(
  sourceFile: SourceFile,
  primitiveName: string
): SubComponentDefinition[] {
  const subComponents: SubComponentDefinition[] = [];
  const interfaces = findPropsInterfaces(sourceFile);
  const requiredSubs = REQUIRED_SUB_COMPONENTS[primitiveName] || [];

  for (const iface of interfaces) {
    const name = iface.getName();

    // Check if it matches the sub-component pattern
    const match = name.match(SUB_COMPONENT_PATTERN);
    if (match && match[1] === primitiveName) {
      const subName = match[2];
      const rawProps = extractPropsFromInterface(iface);
      const props: PropDefinition[] = rawProps.map(classifyProp);

      subComponents.push({
        name: subName,
        props,
        isRequired: requiredSubs.includes(subName),
      });
    } else if (name === `${primitiveName}Props`) {
      // Root component props
      const rawProps = extractPropsFromInterface(iface);
      const props: PropDefinition[] = rawProps.map(classifyProp);

      subComponents.push({
        name: 'Root',
        props,
        isRequired: true,
      });
    }
  }

  return subComponents;
}

/**
 * Enhanced sub-component extraction that also handles ForwardRefExoticComponent.
 * This function combines interface-based extraction with ForwardRef detection.
 */
export function extractSubComponentsEnhanced(
  sourceFile: SourceFile,
  primitiveName: string
): SubComponentDefinition[] {
  const subComponents: SubComponentDefinition[] = [];
  const seenNames = new Set<string>();
  const requiredSubs = REQUIRED_SUB_COMPONENTS[primitiveName] || [];

  // First, try ForwardRef declarations (more common in real .d.ts files)
  const forwardRefDecls = findForwardRefDeclarations(sourceFile);

  for (const decl of forwardRefDecls) {
    const suffix = getSubComponentSuffix(decl.name, primitiveName);
    if (!suffix && decl.name !== primitiveName) continue;

    const subName = suffix || 'Root';
    if (seenNames.has(subName)) continue;
    seenNames.add(subName);

    const rawProps = extractPropsFromForwardRef(sourceFile, decl);
    const filteredProps = rawProps ? filterReactInternals(rawProps) : [];
    const props: PropDefinition[] = filteredProps.map(classifyProp);

    subComponents.push({
      name: subName,
      props,
      isRequired: requiredSubs.includes(subName),
    });
  }

  // Also check for React.FC exports (like DialogPortal)
  const fcDecls = findFCDeclarations(sourceFile, primitiveName);
  for (const { name, propsTypeName } of fcDecls) {
    const suffix = getSubComponentSuffix(name, primitiveName);
    if (!suffix && name !== primitiveName) continue;

    const subName = suffix || 'Root';
    if (seenNames.has(subName)) continue;
    seenNames.add(subName);

    // Try to get props from the interface
    let props: PropDefinition[] = [];
    if (propsTypeName) {
      const propsInterface = sourceFile.getInterface(propsTypeName);
      if (propsInterface) {
        const rawProps = extractPropsFromInterface(propsInterface);
        props = filterReactInternals(rawProps).map(classifyProp);
      }
    }

    subComponents.push({
      name: subName,
      props,
      isRequired: requiredSubs.includes(subName),
    });
  }

  // Fallback: use interface-based extraction if no ForwardRef found
  if (subComponents.length === 0) {
    return extractSubComponents(sourceFile, primitiveName);
  }

  return subComponents;
}

/**
 * Find React.FC variable declarations for a primitive.
 */
function findFCDeclarations(
  sourceFile: SourceFile,
  primitiveName: string
): { name: string; propsTypeName: string | null }[] {
  const results: { name: string; propsTypeName: string | null }[] = [];

  for (const statement of sourceFile.getVariableStatements()) {
    for (const decl of statement.getDeclarations()) {
      const typeNode = decl.getTypeNode();
      if (!typeNode) continue;

      const typeText = typeNode.getText();
      const name = decl.getName();

      // Check if it's React.FC and matches our primitive
      if (
        (typeText.includes('React.FC') || typeText.includes('FC<')) &&
        name.startsWith(primitiveName)
      ) {
        // Extract props type from FC<PropsType>
        const match = typeText.match(/(?:React\.)?FC<(\w+)>/);
        results.push({
          name,
          propsTypeName: match ? match[1] : null,
        });
      }
    }
  }

  return results;
}

/**
 * Find exported names from a source file.
 */
export function findExports(sourceFile: SourceFile): string[] {
  const exports: string[] = [];

  // Get export declarations
  for (const exportDecl of sourceFile.getExportDeclarations()) {
    for (const named of exportDecl.getNamedExports()) {
      exports.push(named.getName());
    }
  }

  // Get export assignments (export default)
  const defaultExport = sourceFile.getDefaultExportSymbol();
  if (defaultExport) {
    exports.push('default');
  }

  // Get directly exported declarations
  for (const stmt of sourceFile.getStatements()) {
    if (stmt.getText().startsWith('export ')) {
      // Try to extract the name
      const text = stmt.getText();
      const match = text.match(/export\s+(?:const|let|var|function|class|interface|type)\s+(\w+)/);
      if (match) {
        exports.push(match[1]);
      }
    }
  }

  return [...new Set(exports)];
}

/**
 * Check if the primitive uses React Context.
 */
export function detectContextUsage(sourceFile: SourceFile): boolean {
  const text = sourceFile.getFullText();
  return text.includes('createContext') || text.includes('useContext') || text.includes('Provider');
}

/**
 * Extract context shape if present.
 */
export function extractContextShape(
  sourceFile: SourceFile,
  primitiveName: string
): PropDefinition[] | undefined {
  // Look for *ContextValue interface
  const contextInterface = sourceFile.getInterface(`${primitiveName}ContextValue`);

  if (contextInterface) {
    const rawProps = extractPropsFromInterface(contextInterface);
    return rawProps.map(classifyProp);
  }

  return undefined;
}

/**
 * Extract a complete primitive from a source file.
 * Uses enhanced extraction with ForwardRef support for real .d.ts files.
 */
export function extractPrimitiveFromSource(
  sourceFile: SourceFile,
  primitiveName: string,
  packageName: string,
  version: string
): ExtractedPrimitive {
  // Try enhanced extraction first (handles ForwardRefExoticComponent)
  let subComponents = extractSubComponentsEnhanced(sourceFile, primitiveName);

  // Fallback to standard extraction if enhanced returns empty
  if (subComponents.length === 0) {
    subComponents = extractSubComponents(sourceFile, primitiveName);
  }

  // Find root props (either from XxxProps or from Root sub-component)
  const rootSubComponent = subComponents.find((s) => s.name === 'Root');
  const rootProps = rootSubComponent?.props || [];

  return {
    name: primitiveName,
    package: packageName,
    version,
    extractedAt: new Date().toISOString(),
    rootProps,
    subComponents,
    exports: findExports(sourceFile),
    usesContext: detectContextUsage(sourceFile),
    contextShape: extractContextShape(sourceFile, primitiveName),
  };
}
