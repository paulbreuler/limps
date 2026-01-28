/**
 * ts-morph project setup for parsing type definitions.
 */

import { Project, SourceFile } from 'ts-morph';

/**
 * Create a ts-morph Project with in-memory file system.
 */
export function createProject(): Project {
  return new Project({
    useInMemoryFileSystem: true,
    compilerOptions: {
      target: 99, // ESNext
      module: 99, // ESNext
      lib: ['lib.esnext.d.ts', 'lib.dom.d.ts'],
      strict: true,
      skipLibCheck: true,
    },
  });
}

/**
 * Create a source file from type content.
 */
export function createSourceFile(
  project: Project,
  content: string,
  fileName: string = 'index.d.ts'
): SourceFile {
  return project.createSourceFile(fileName, content, { overwrite: true });
}

/**
 * Parse type content and return a source file.
 */
export function parseTypes(content: string): SourceFile {
  const project = createProject();
  return createSourceFile(project, content);
}
