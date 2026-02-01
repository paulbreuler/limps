export const ENTITY_TYPES = ['plan', 'agent', 'feature', 'file', 'tag', 'concept'] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export interface Entity {
  id: number;
  type: EntityType;
  canonicalId: string;
  name: string;
  sourcePath?: string;
  contentHash?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export const RELATION_TYPES = [
  'CONTAINS',
  'DEPENDS_ON',
  'MODIFIES',
  'IMPLEMENTS',
  'SIMILAR_TO',
  'BLOCKS',
  'TAGGED_WITH',
] as const;

export type RelationType = (typeof RELATION_TYPES)[number];

export interface Relationship {
  id: number;
  sourceId: number;
  targetId: number;
  relationType: RelationType;
  confidence: number;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface GraphStats {
  entityCounts: Record<EntityType, number>;
  relationCounts: Record<RelationType, number>;
  totalEntities: number;
  totalRelations: number;
  lastIndexed: string;
}
