/**
 * Type alias resolution and intersection merging.
 * Handles complex type patterns in .d.ts files.
 */

import type { SourceFile, TypeAliasDeclaration, InterfaceDeclaration } from 'ts-morph';
import { SyntaxKind } from 'ts-morph';
import type { RawProp } from '../types/index.js';
import { extractPropsFromInterface } from './props.js';

/**
 * Props that should be filtered out as React internals.
 * These are not useful for component analysis.
 */
const REACT_INTERNAL_PROPS = new Set([
  'ref',
  'key',
  // Internal event handlers from DOM
  'dangerouslySetInnerHTML',
]);

/**
 * Resolve a type alias to its underlying properties.
 * Handles intersections, references to interfaces, and inline object types.
 *
 * @returns Array of RawProp or null if type not found
 */
export function resolveTypeAlias(sourceFile: SourceFile, aliasName: string): RawProp[] | null {
  // First try to find as a type alias
  const typeAlias = sourceFile.getTypeAlias(aliasName);
  if (typeAlias) {
    return mergeIntersectionTypes(sourceFile, typeAlias);
  }

  // Fallback: try as interface
  const iface = sourceFile.getInterface(aliasName);
  if (iface) {
    return extractPropsFromInterface(iface);
  }

  return null;
}

/**
 * Merge all parts of an intersection type into a single props array.
 */
export function mergeIntersectionTypes(
  _sourceFile: SourceFile,
  typeAlias: TypeAliasDeclaration
): RawProp[] {
  const props: RawProp[] = [];
  const seenNames = new Set<string>();

  const type = typeAlias.getType();

  // Get all properties from the resolved type
  // ts-morph's type.getProperties() automatically resolves intersections
  for (const prop of type.getProperties()) {
    const name = prop.getName();

    if (seenNames.has(name)) continue;
    seenNames.add(name);

    const declarations = prop.getDeclarations();
    const propDecl = declarations[0];

    if (!propDecl) continue;

    const propType = prop.getTypeAtLocation(propDecl);
    const typeText = simplifyTypeText(propType.getText());

    // Determine if optional
    let isOptional = false;
    if (propDecl.getKindName() === 'PropertySignature') {
      isOptional =
        (propDecl as unknown as { hasQuestionToken(): boolean }).hasQuestionToken?.() ?? false;
    } else {
      // Check if type includes undefined
      isOptional = typeText.includes('undefined');
    }

    props.push({
      name,
      type: typeText,
      required: !isOptional,
    });
  }

  return props;
}

/**
 * Resolve a type reference to its interface or type alias.
 */
export function resolveTypeReference(
  sourceFile: SourceFile,
  typeName: string
): InterfaceDeclaration | TypeAliasDeclaration | null {
  // Try interface first
  const iface = sourceFile.getInterface(typeName);
  if (iface) return iface;

  // Try type alias
  const typeAlias = sourceFile.getTypeAlias(typeName);
  if (typeAlias) return typeAlias;

  return null;
}

/**
 * Filter out React internal props.
 * Keeps `children` as it's compositionally relevant.
 */
export function filterReactInternals(props: RawProp[]): RawProp[] {
  return props.filter((p) => !REACT_INTERNAL_PROPS.has(p.name));
}

/**
 * Simplify complex type text for readability.
 */
function simplifyTypeText(text: string): string {
  return text
    .replace(/React\.ReactNode/g, 'ReactNode')
    .replace(/React\.ReactElement/g, 'ReactElement')
    .replace(/React\.CSSProperties/g, 'CSSProperties')
    .replace(/React\.HTMLAttributes<.*?>/g, 'HTMLAttributes')
    .replace(/React\.ComponentPropsWithoutRef<.*?>/g, 'ComponentProps')
    .replace(/React\.Ref<.*?>/g, 'Ref')
    .replace(/React\.RefAttributes<.*?>/g, 'RefAttributes')
    .replace(/import\(".*?"\)\./g, '');
}

/**
 * Extract property names from an intersection type node.
 * Useful for debugging and understanding type structure.
 */
export function getIntersectionParts(typeAlias: TypeAliasDeclaration): string[] {
  const parts: string[] = [];
  const typeNode = typeAlias.getTypeNode();

  if (!typeNode) return parts;

  if (typeNode.getKind() === SyntaxKind.IntersectionType) {
    for (const child of typeNode.forEachChildAsArray()) {
      parts.push(child.getText());
    }
  } else {
    parts.push(typeNode.getText());
  }

  return parts;
}
