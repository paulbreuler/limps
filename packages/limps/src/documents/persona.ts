import { createHash } from 'crypto';
import type { IDocument, DocumentType } from './types.js';
import { serializeDocument } from './serializer.js';

export class Persona implements IDocument {
  readonly type: DocumentType = 'persona';
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly created: string;

  constructor(title: string, description: string, created?: string) {
    this.title = title;
    this.description = description;
    this.created = created ?? new Date().toISOString().slice(0, 10);
    this.id = createHash('sha256').update(`persona:${title}`).digest('hex').slice(0, 8);
  }

  frontmatter(): Record<string, unknown> {
    return {
      type: 'persona',
      title: this.title,
      description: this.description,
      created: this.created,
      tags: ['limps/persona'],
    };
  }

  sections(): Map<string, string> {
    return new Map([
      ['Overview', this.description],
      ['Goals', ''],
      ['Pain Points', ''],
    ]);
  }

  toMarkdown(): string {
    const body = `# Persona: ${this.title}\n\n## Overview\n\n${this.description}\n\n## Goals\n\n<!-- Add goals here -->\n\n## Pain Points\n\n<!-- Add pain points here -->\n`;
    return serializeDocument(this.frontmatter(), body);
  }
}
