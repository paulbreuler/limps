/**
 * unpkg CDN client for fetching type definitions.
 */

import { primitiveToPackage } from './npm-registry.js';

const UNPKG_URL = 'https://unpkg.com';

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
  const url = buildTypesUrl(packageName, version);

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      // Try alternate path for some packages
      const altUrl = `${UNPKG_URL}/${packageName}@${version}/dist/index.d.mts`;
      const altResponse = await fetch(altUrl);

      if (altResponse.ok) {
        return altResponse.text();
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
