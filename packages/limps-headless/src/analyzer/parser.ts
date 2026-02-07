/**
 * Component parser for local .tsx files.
 * Parses React components to extract AST and component structure.
 */

import { Project } from 'ts-morph';
import type { SourceFile } from 'ts-morph';
import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * Create a ts-morph Project for parsing local files.
 * Uses file system (not in-memory) to read actual .tsx files.
 */
export function createLocalProject(): Project {
  return new Project({
    useInMemoryFileSystem: false,
    compilerOptions: {
      target: 99, // ESNext
      module: 99, // ESNext
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
      jsx: 2, // React
      strict: true,
      skipLibCheck: true,
    },
  });
}

/**
 * Load a .tsx file and return its SourceFile.
 * @param filePath - Path to the .tsx file
 * @param project - Optional ts-morph Project (creates new if not provided)
 * @returns SourceFile or null if file doesn't exist
 */
export function parseComponent(filePath: string, project?: Project): SourceFile | null {
  // Normalize path
  const normalizedPath = path.resolve(filePath);

  // Check if file exists
  if (!fs.existsSync(normalizedPath)) {
    return null;
  }

  // Create project if not provided
  const proj = project || createLocalProject();

  // Add the file to the project
  // ts-morph will read from disk automatically
  try {
    return proj.addSourceFileAtPath(normalizedPath);
  } catch (_error) {
    // File might not be valid TypeScript/TSX
    return null;
  }
}

/**
 * Get the component name from a file path.
 * @example "/path/to/Modal.tsx" -> "Modal"
 */
export function getComponentNameFromPath(filePath: string): string {
  const basename = path.basename(filePath, path.extname(filePath));
  return basename;
}
