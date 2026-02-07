/**
 * ForwardRefExoticComponent extraction for complex .d.ts files.
 * Handles patterns like: React.ForwardRefExoticComponent<Props & React.RefAttributes<Element>>
 */

import type { SourceFile, VariableDeclaration, TypeNode } from 'ts-morph';
import type { RawProp } from '../types/index.js';
import { extractPropsFromInterface } from './props.js';

/**
 * Result of finding a ForwardRef declaration.
 */
export interface ForwardRefDeclaration {
  name: string;
  declaration: VariableDeclaration;
  propsTypeName: string | null;
}

/**
 * Find all ForwardRefExoticComponent variable declarations in a source file.
 */
export function findForwardRefDeclarations(sourceFile: SourceFile): ForwardRefDeclaration[] {
  const results: ForwardRefDeclaration[] = [];

  for (const statement of sourceFile.getVariableStatements()) {
    for (const decl of statement.getDeclarations()) {
      const typeNode = decl.getTypeNode();
      if (!typeNode) continue;

      const typeText = typeNode.getText();
      if (typeText.includes('ForwardRefExoticComponent')) {
        const name = decl.getName();
        const propsTypeName = extractPropsTypeFromForwardRef(typeNode);

        results.push({
          name,
          declaration: decl,
          propsTypeName,
        });
      }
    }
  }

  return results;
}

/**
 * Extract the props type name from a ForwardRefExoticComponent type.
 * Handles: ForwardRefExoticComponent<DialogRootProps & React.RefAttributes<...>>
 */
function extractPropsTypeFromForwardRef(typeNode: TypeNode): string | null {
  const typeText = typeNode.getText();

  // Match pattern: ForwardRefExoticComponent<TypeName & ...>
  // or ForwardRefExoticComponent<TypeName>
  const match = typeText.match(/ForwardRefExoticComponent<\s*(\w+)(?:\s*&|>)/);
  if (match) {
    return match[1];
  }

  return null;
}

/**
 * Extract props from a ForwardRef declaration by resolving its type parameter.
 */
export function extractPropsFromForwardRef(
  sourceFile: SourceFile,
  decl: ForwardRefDeclaration
): RawProp[] | null {
  const { propsTypeName, declaration } = decl;

  // Try to find the props interface directly
  if (propsTypeName) {
    const propsInterface = sourceFile.getInterface(propsTypeName);
    if (propsInterface) {
      const props = extractPropsFromInterface(propsInterface);
      return filterRefAttributes(props);
    }
  }

  // Fallback: try to extract from the type directly using ts-morph's type system
  const typeNode = declaration.getTypeNode();
  if (!typeNode) return null;

  const props = extractPropsFromTypeNode(sourceFile, typeNode);
  return filterRefAttributes(props);
}

/**
 * Extract props from a TypeNode (for inline type definitions).
 */
function extractPropsFromTypeNode(_sourceFile: SourceFile, typeNode: TypeNode): RawProp[] {
  const props: RawProp[] = [];

  // Get the type from the type checker
  const type = typeNode.getType();

  // For ForwardRefExoticComponent, we need the first type argument
  const typeArgs = type.getTypeArguments();
  if (typeArgs.length === 0) return props;

  const propsType = typeArgs[0];

  // Get all properties from the type (resolves intersections)
  for (const prop of propsType.getProperties()) {
    const name = prop.getName();
    const declarations = prop.getDeclarations();
    const propDecl = declarations[0];

    if (!propDecl) continue;

    // Get the type from the property
    const propType = prop.getTypeAtLocation(propDecl);
    const typeText = propType.getText();

    // Check if optional (has question token or is union with undefined)
    const isOptional =
      propDecl.getKindName() === 'PropertySignature'
        ? ((propDecl as unknown as { hasQuestionToken(): boolean }).hasQuestionToken?.() ?? false)
        : typeText.includes('undefined');

    props.push({
      name,
      type: simplifyTypeText(typeText),
      required: !isOptional,
    });
  }

  return props;
}

/**
 * Filter out React.RefAttributes props (ref).
 */
function filterRefAttributes(props: RawProp[]): RawProp[] {
  const refAttributeProps = ['ref'];
  return props.filter((p) => !refAttributeProps.includes(p.name));
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
 * Get the sub-component suffix from a component name.
 * @example "DialogContent" with primitive "Dialog" -> "Content"
 */
export function getSubComponentSuffix(componentName: string, primitiveName: string): string | null {
  if (!componentName.startsWith(primitiveName)) return null;

  const suffix = componentName.slice(primitiveName.length);
  if (!suffix) return null;

  // Ensure suffix starts with uppercase (valid sub-component)
  if (!/^[A-Z]/.test(suffix)) return null;

  return suffix;
}
