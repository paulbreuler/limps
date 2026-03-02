export type DocumentType = 'persona' | 'journey' | 'spec' | 'agent';

export interface IDocument {
  id: string;
  type: DocumentType;
  title: string;
  frontmatter(): Record<string, unknown>;
  sections(): Map<string, string>;
  toMarkdown(): string;
}

export interface InvestCriteria {
  independent: boolean;
  negotiable: boolean;
  valuable: boolean;
  estimable: boolean;
  small: boolean;
  testable: boolean;
}

export interface InvestReport {
  score: number;
  criteria: InvestCriteria;
  warnings: string[];
  pass: boolean;
}
