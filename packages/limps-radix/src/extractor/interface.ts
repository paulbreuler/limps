/**
 * Interface extraction from TypeScript source files.
 */

import type { SourceFile, InterfaceDeclaration } from 'ts-morph';
import type {
  SubComponentDefinition,
  ExtractedPrimitive,
  PropDefinition,
} from '../types/index.js';
import { extractPropsFromInterface, isPropsInterface } from './props.js';
import { classifyProp } from './classifier.js';

/**
 * Pattern for Radix sub-component naming.
 * @example "DialogRoot", "DialogContent", "DialogTrigger"
 */
const SUB_COMPONENT_PATTERN = /^([A-Z][a-z]+)(Root|Trigger|Content|Title|Description|Close|Overlay|Portal|Arrow|Item|Indicator|Thumb|Track|Range|Viewport|Scrollbar|Corner|Action|Cancel|Group|Label|Separator|Sub|List|Value|Icon|Image|Fallback)Props$/;

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
export function findPropsInterfaces(
  sourceFile: SourceFile
): InterfaceDeclaration[] {
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
  return (
    text.includes('createContext') ||
    text.includes('useContext') ||
    text.includes('Provider')
  );
}

/**
 * Extract context shape if present.
 */
export function extractContextShape(
  sourceFile: SourceFile,
  primitiveName: string
): PropDefinition[] | undefined {
  // Look for *ContextValue interface
  const contextInterface = sourceFile.getInterface(
    `${primitiveName}ContextValue`
  );

  if (contextInterface) {
    const rawProps = extractPropsFromInterface(contextInterface);
    return rawProps.map(classifyProp);
  }

  return undefined;
}

/**
 * Extract a complete primitive from a source file.
 */
export function extractPrimitiveFromSource(
  sourceFile: SourceFile,
  primitiveName: string,
  packageName: string,
  version: string
): ExtractedPrimitive {
  const subComponents = extractSubComponents(sourceFile, primitiveName);

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
