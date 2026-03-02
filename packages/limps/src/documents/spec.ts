import { createHash } from 'crypto';
import type { IDocument, DocumentType } from './types.js';
import { serializeDocument } from './serializer.js';

export interface SpecOptions {
  title: string;
  planId: string;
  fromJourneyPath?: string;
  created?: string;
}

export class Spec implements IDocument {
  readonly type: DocumentType = 'spec';
  readonly id: string;
  readonly title: string;
  readonly planId: string;
  readonly fromJourneyPath?: string;
  readonly created: string;

  constructor(options: SpecOptions) {
    this.title = options.title;
    this.planId = options.planId;
    this.fromJourneyPath = options.fromJourneyPath;
    this.created = options.created ?? new Date().toISOString().slice(0, 10);
    this.id = createHash('sha256')
      .update(`spec:${options.planId}:${options.title}`)
      .digest('hex')
      .slice(0, 8);
  }

  frontmatter(): Record<string, unknown> {
    const fm: Record<string, unknown> = {
      type: 'spec',
      title: this.title,
      planId: this.planId,
      created: this.created,
      tags: ['limps/spec'],
    };
    if (this.fromJourneyPath) {
      fm.fromJourney = this.fromJourneyPath;
    }
    return fm;
  }

  sections(): Map<string, string> {
    return new Map([
      ['Problem Statement', ''],
      ['Goals & Non-Goals', ''],
      ['Proposed Solution', ''],
      ['Architecture', ''],
      ['Data Model', ''],
      ['API Design', ''],
      ['Security Considerations', ''],
      ['Performance', ''],
      ['Testing Strategy', ''],
      ['Rollout Plan', ''],
      ['Open Questions', ''],
      ['References', ''],
    ]);
  }

  toMarkdown(): string {
    const sectionHeaders = [
      ['Problem Statement', '<!-- What problem does this solve? -->'],
      [
        'Goals & Non-Goals',
        '### Goals\n\n- <!-- Goal 1 -->\n\n### Non-Goals\n\n- <!-- Non-goal 1 -->',
      ],
      ['Proposed Solution', '<!-- High-level approach -->'],
      ['Architecture', '<!-- System design, component relationships -->'],
      ['Data Model', '<!-- Schema, entities, relationships -->'],
      ['API Design', '<!-- Endpoints, contracts, examples -->'],
      ['Security Considerations', '<!-- Auth, authz, input validation, secrets -->'],
      ['Performance', '<!-- Expected load, bottlenecks, optimization strategies -->'],
      ['Testing Strategy', '<!-- Unit, integration, e2e test plan -->'],
      ['Rollout Plan', '<!-- Phased rollout, feature flags, monitoring -->'],
      ['Open Questions', '<!-- Unresolved decisions -->'],
      ['References', '<!-- Links to related docs, RFCs, prior art -->'],
    ] as const;

    let body = `# Spec: ${this.title}\n\n`;
    for (const [heading, placeholder] of sectionHeaders) {
      body += `## ${heading}\n\n${placeholder}\n\n`;
    }

    return serializeDocument(this.frontmatter(), body);
  }
}
