/**
 * Props extraction from local component files.
 * Handles various prop patterns: interfaces, inline props, FC generics, ForwardRef.
 */

import type {
  SourceFile,
  InterfaceDeclaration,
  FunctionDeclaration,
  VariableDeclaration,
  TypeNode,
} from 'ts-morph';
import type { PropDefinition, RawProp } from '../types/index.js';
import { extractPropsFromInterface } from '../extractor/props.js';
import {
  findForwardRefDeclarations,
  extractPropsFromForwardRef,
} from '../extractor/forward-ref.js';
import { classifyProp } from '../extractor/classifier.js';
import { filterReactInternals } from '../extractor/type-resolver.js';

/**
 * Extract props from a component file.
 * Tries multiple patterns:
 * 1. Named Props interface (e.g., ModalProps)
 * 2. Inline props in function parameters
 * 3. FC generic (const Modal: FC<ModalProps>)
 * 4. ForwardRefExoticComponent
 */
export function extractProps(
  sourceFile: SourceFile,
  componentName?: string
): Map<string, PropDefinition> {
  const propsMap = new Map<string, PropDefinition>();

  // Try to find named Props interface first
  const propsInterface = findPropsInterface(sourceFile, componentName);
  if (propsInterface) {
    const rawProps = extractPropsFromInterface(propsInterface);
    for (const rawProp of rawProps) {
      const classified = classifyProp(rawProp);
      propsMap.set(classified.name, classified);
    }
    return propsMap;
  }

  // Try ForwardRef declarations
  const forwardRefDecls = findForwardRefDeclarations(sourceFile);
  if (forwardRefDecls.length > 0) {
    for (const decl of forwardRefDecls) {
      if (componentName && decl.name !== componentName) continue;

      const rawProps = extractPropsFromForwardRef(sourceFile, decl);
      if (rawProps) {
        const filtered = filterReactInternals(rawProps);
        for (const rawProp of filtered) {
          const classified = classifyProp(rawProp);
          propsMap.set(classified.name, classified);
        }
        return propsMap;
      }
    }
  }

  // Try function component with inline props
  const funcDecl = findFunctionComponent(sourceFile, componentName);
  if (funcDecl) {
    const rawProps = extractPropsFromFunction(funcDecl);
    for (const rawProp of rawProps) {
      const classified = classifyProp(rawProp);
      propsMap.set(classified.name, classified);
    }
    return propsMap;
  }

  // Try FC generic pattern
  const fcDecl = findFCComponent(sourceFile, componentName);
  if (fcDecl) {
    const rawProps = extractPropsFromFC(fcDecl, sourceFile);
    for (const rawProp of rawProps) {
      const classified = classifyProp(rawProp);
      propsMap.set(classified.name, classified);
    }
    return propsMap;
  }

  return propsMap;
}

/**
 * Find a Props interface (e.g., ModalProps, DialogProps).
 */
function findPropsInterface(
  sourceFile: SourceFile,
  componentName?: string
): InterfaceDeclaration | null {
  const interfaces = sourceFile.getInterfaces();

  // If component name provided, look for ComponentNameProps
  if (componentName) {
    const propsName = `${componentName}Props`;
    const iface = sourceFile.getInterface(propsName);
    if (iface) return iface;
  }

  // Look for any interface ending in "Props"
  for (const iface of interfaces) {
    if (iface.getName().endsWith('Props')) {
      return iface;
    }
  }

  return null;
}

/**
 * Find a function component declaration.
 */
function findFunctionComponent(
  sourceFile: SourceFile,
  componentName?: string
): FunctionDeclaration | null {
  const functions = sourceFile.getFunctions();

  if (componentName) {
    const func = sourceFile.getFunction(componentName);
    if (func) return func;
  }

  // Look for exported function (common pattern)
  for (const func of functions) {
    if (func.isExported()) {
      return func;
    }
  }

  return null;
}

/**
 * Extract props from a function component with inline props.
 * Handles: function Modal({ open, onOpenChange }: { open: boolean; ... }) { ... }
 */
function extractPropsFromFunction(
  func: FunctionDeclaration
): RawProp[] {
  const params = func.getParameters();
  if (params.length === 0) return [];

  // First parameter is usually the props
  const propsParam = params[0];
  const typeNode = propsParam.getTypeNode();

  if (!typeNode) {
    // Try to infer from type
    const type = propsParam.getType();
    return extractPropsFromType(type);
  }

  // Extract from type node
  return extractPropsFromTypeNode(typeNode);
}

/**
 * Extract props from a TypeNode (inline type literal).
 */
function extractPropsFromTypeNode(typeNode: TypeNode): RawProp[] {
  const props: RawProp[] = [];
  const type = typeNode.getType();

  // Get properties from the type
  for (const prop of type.getProperties()) {
    const name = prop.getName();
    const declarations = prop.getDeclarations();
    const propDecl = declarations[0];

    if (!propDecl) continue;

    const propType = prop.getTypeAtLocation(propDecl);
    const typeText = propType.getText();

    // Check if optional
    const isOptional =
      propDecl.getKindName() === 'PropertySignature'
        ? (propDecl as unknown as { hasQuestionToken(): boolean })
            .hasQuestionToken?.() ?? false
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
 * Extract props from a Type (from type checker).
 */
function extractPropsFromType(type: ReturnType<SourceFile['getType']>): RawProp[] {
  const props: RawProp[] = [];

  for (const prop of type.getProperties()) {
    const name = prop.getName();
    const declarations = prop.getDeclarations();
    const propDecl = declarations[0];

    if (!propDecl) continue;

    const propType = prop.getTypeAtLocation(propDecl);
    const typeText = propType.getText();

    // Check if optional (union with undefined)
    const isOptional = typeText.includes('undefined');

    props.push({
      name,
      type: simplifyTypeText(typeText),
      required: !isOptional,
    });
  }

  return props;
}

/**
 * Find a React.FC component declaration.
 * Handles: const Modal: FC<ModalProps> = ...
 */
function findFCComponent(
  sourceFile: SourceFile,
  componentName?: string
): VariableDeclaration | null {
  for (const statement of sourceFile.getVariableStatements()) {
    for (const decl of statement.getDeclarations()) {
      const name = decl.getName();
      if (componentName && name !== componentName) continue;

      const typeNode = decl.getTypeNode();
      if (!typeNode) continue;

      const typeText = typeNode.getText();
      if (typeText.includes('FC<') || typeText.includes('React.FC<')) {
        return decl;
      }
    }
  }

  return null;
}

/**
 * Extract props from a React.FC declaration.
 */
function extractPropsFromFC(
  decl: VariableDeclaration,
  sourceFile: SourceFile
): RawProp[] {
  const typeNode = decl.getTypeNode();
  if (!typeNode) return [];

  const type = typeNode.getType();
  const typeArgs = type.getTypeArguments();

  if (typeArgs.length === 0) return [];

  // First type argument is the props type
  const propsType = typeArgs[0];

  // Try to get the interface name
  const typeText = typeNode.getText();
  const match = typeText.match(/(?:React\.)?FC<(\w+)>/);
  if (match) {
    const propsTypeName = match[1];
    const propsInterface = sourceFile.getInterface(propsTypeName);
    if (propsInterface) {
      return extractPropsFromInterface(propsInterface);
    }
  }

  // Fallback: extract from type directly
  return extractPropsFromType(propsType);
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
    .replace(/import\(".*?"\)\./g, '');
}
