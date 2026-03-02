import { createHash } from 'crypto';
import type { IDocument, DocumentType } from './types.js';
import { serializeDocument } from './serializer.js';

export interface JourneyOptions {
  title: string;
  personaPath?: string;
  description?: string;
  created?: string;
}

export class Journey implements IDocument {
  readonly type: DocumentType = 'journey';
  readonly id: string;
  readonly title: string;
  readonly personaPath?: string;
  readonly description: string;
  readonly created: string;

  constructor(options: JourneyOptions) {
    this.title = options.title;
    this.personaPath = options.personaPath;
    this.description = options.description ?? '';
    this.created = options.created ?? new Date().toISOString().slice(0, 10);
    this.id = createHash('sha256').update(`journey:${options.title}`).digest('hex').slice(0, 8);
  }

  frontmatter(): Record<string, unknown> {
    const fm: Record<string, unknown> = {
      type: 'journey',
      title: this.title,
      created: this.created,
      tags: ['limps/journey'],
    };
    if (this.personaPath) {
      fm.persona = this.personaPath;
    }
    return fm;
  }

  sections(): Map<string, string> {
    return new Map([
      ['Scenario', this.description],
      ['Steps', ''],
      ['Pain Points', ''],
      ['Opportunities', ''],
    ]);
  }

  toMarkdown(): string {
    const body = `# Journey: ${this.title}\n\n## Scenario\n\n${this.description || '<!-- Describe the scenario this journey covers -->'}\n\n## Steps\n\n1. <!-- Step 1 -->\n2. <!-- Step 2 -->\n3. <!-- Step 3 -->\n\n## Pain Points\n\n<!-- Where does the persona struggle in this journey? -->\n\n## Opportunities\n\n<!-- What could be improved? -->\n`;
    return serializeDocument(this.frontmatter(), body);
  }
}
