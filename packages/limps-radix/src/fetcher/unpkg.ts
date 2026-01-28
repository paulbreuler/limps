/**
 * unpkg CDN client for fetching type definitions.
 */

import { primitiveToPackage } from './npm-registry.js';

const UNPKG_URL = 'https://unpkg.com';

async function fetchTypeDefinition(
  packageName: string,
  version: string,
  typesPath: string,
  fallbackPath?: string
): Promise<string> {
  const url = `${UNPKG_URL}/${packageName}@${version}/${typesPath}`;
  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404 && fallbackPath) {
      const fallbackUrl = `${UNPKG_URL}/${packageName}@${version}/${fallbackPath}`;
      const fallbackResponse = await fetch(fallbackUrl);
      if (fallbackResponse.ok) {
        return fallbackResponse.text();
      }
      throw new Error(
        `Type definitions not found for ${packageName}@${version}`
      );
    }
    throw new Error(
      `Failed to fetch types: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}

/**
 * Build the URL for a package's type definitions on unpkg.
 */
export function buildTypesUrl(packageName: string, version: string): string {
  return `${UNPKG_URL}/${packageName}@${version}/dist/index.d.ts`;
}

/**
 * Fetch type definitions for a Radix primitive from unpkg.
 */
export async function fetchTypes(
  primitive: string,
  version: string
): Promise<string> {
  const packageName = primitiveToPackage(primitive);
  return fetchTypeDefinition(
    packageName,
    version,
    'dist/index.d.ts',
    'dist/index.d.mts'
  );
}

/**
 * Fetch type definitions from the unified radix-ui package.
 */
export async function fetchFromUnifiedPackage(
  primitive: string,
  version: string,
  typesPath?: string
): Promise<string> {
  const normalized = primitive.toLowerCase().replace(/\s+/g, '-');
  const resolvedPath = typesPath ?? `dist/${normalized}.d.ts`;
  const fallbackPath = resolvedPath.endsWith('.d.ts')
    ? resolvedPath.replace(/\.d\.ts$/, '.d.mts')
    : undefined;

  return fetchTypeDefinition(
    'radix-ui',
    version,
    resolvedPath,
    fallbackPath
  );
}

/**
 * Fetch raw file content from a package on unpkg.
 */
export async function fetchPackageFile(
  packageName: string,
  version: string,
  filePath: string
): Promise<string> {
  const url = `${UNPKG_URL}/${packageName}@${version}/${filePath}`;

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch ${filePath}: ${response.status} ${response.statusText}`
    );
  }

  return response.text();
}
