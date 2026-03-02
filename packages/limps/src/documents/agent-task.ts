import { createHash } from 'crypto';
import type { IDocument, DocumentType } from './types.js';
import { serializeDocument } from './serializer.js';

export interface AgentTaskOptions {
  title: string;
  planId: string;
  persona?: string;
  dependencies?: string[];
  blocks?: string[];
  files?: string[];
  primerPath?: string;
  primerContent?: string;
  created?: string;
}

export class AgentTask implements IDocument {
  readonly type: DocumentType = 'agent';
  readonly id: string;
  readonly title: string;
  readonly planId: string;
  readonly persona: string;
  readonly dependencies: string[];
  readonly blocks: string[];
  readonly files: string[];
  readonly primerPath?: string;
  readonly primerContent?: string;
  readonly created: string;

  constructor(options: AgentTaskOptions) {
    this.title = options.title;
    this.planId = options.planId;
    this.persona = options.persona ?? 'coder';
    this.dependencies = options.dependencies ?? [];
    this.blocks = options.blocks ?? [];
    this.files = options.files ?? [];
    this.primerPath = options.primerPath;
    this.primerContent = options.primerContent;
    this.created = options.created ?? new Date().toISOString().slice(0, 10);
    this.id = createHash('sha256')
      .update(`agent:${options.planId}:${options.title}`)
      .digest('hex')
      .slice(0, 8);
  }

  frontmatter(): Record<string, unknown> {
    const fm: Record<string, unknown> = {
      type: 'agent',
      status: 'GAP',
      persona: this.persona,
      title: this.title,
      dependencies: this.dependencies,
      blocks: this.blocks,
      files: this.files,
      created: this.created,
      tags: ['limps/agent', 'limps/status/gap'],
    };
    if (this.primerPath) {
      fm.primer = this.primerPath;
    }
    return fm;
  }

  sections(): Map<string, string> {
    return new Map([
      ['Task', ''],
      ['Acceptance Criteria', ''],
      ['Files to Modify', this.files.map((f) => `- ${f}`).join('\n')],
      ['Verification', ''],
    ]);
  }

  toMarkdown(): string {
    let body = `# Agent: ${this.title}\n\n`;

    if (this.primerContent && this.primerPath) {
      body += `<!-- LIMPS:PRIMER path="${this.primerPath}" -->\n${this.primerContent}\n<!-- /LIMPS:PRIMER -->\n\n`;
    }

    body += `## Task\n\n<!-- Describe the task with sufficient context for an AI agent to execute it independently -->\n\n`;
    body += `## Acceptance Criteria\n\n- [ ] <!-- Add testable acceptance criteria -->\n\n`;
    body += `## Files to Modify\n\n${this.files.map((f) => `- \`${f}\``).join('\n') || '<!-- List files to create or modify -->'}\n\n`;
    body += `## Verification\n\n\`\`\`bash\nnpm test\n\`\`\`\n`;

    return serializeDocument(this.frontmatter(), body);
  }
}
