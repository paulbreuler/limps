import matter from 'gray-matter';
import type { IDocument } from './types.js';
import { Persona } from './persona.js';
import { AgentTask } from './agent-task.js';

export function parseDocument(content: string, _filePath: string): IDocument | null {
  const { data } = matter(content);
  const type = data.type as string | undefined;

  switch (type) {
    case 'persona':
      return new Persona((data.title as string) ?? _filePath, (data.description as string) ?? '');
    case 'agent':
      return new AgentTask({
        title: (data.title as string) ?? _filePath,
        planId: (data.planId as string) ?? '',
        persona: data.persona as string,
        dependencies: data.dependencies as string[],
        blocks: data.blocks as string[],
        files: data.files as string[],
        primerPath: data.primer as string,
      });
    default:
      return null;
  }
}
