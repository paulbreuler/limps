export type EvidenceSource =
  | 'import'
  | 'jsx'
  | 'props'
  | 'types'
  | 'role'
  | 'data-attr'
  | 'behavior'
  | 'module-graph'
  | 'config';

export type EvidenceStrength = 'strong' | 'possible' | 'weak';

export interface EvidenceLocation {
  file: string;
  line: number;
  column: number;
}

export interface Evidence {
  id: string;
  source: EvidenceSource;
  strength: EvidenceStrength;
  weight: number;
  location?: EvidenceLocation;
  notes?: string;
}

export interface ImportSpec {
  source: string;
  named: string[];
  defaultName?: string;
  namespace?: string;
}

export interface JsxEvidence {
  elements: string[];
  attributes: string[];
  roles: string[];
  dataAttrs: string[];
}

export interface BehaviorEvidence {
  behaviors: string[];
  handlers: string[];
}

export interface ComponentIR {
  id: string;
  filePath: string;
  exportName: string;
  localName: string;
  imports: ImportSpec[];
  jsx: JsxEvidence;
  behaviors: BehaviorEvidence;
  evidence: Evidence[];
  dependencies: string[];
  reexports: string[];
}
