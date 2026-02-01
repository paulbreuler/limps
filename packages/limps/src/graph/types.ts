export type EntityType = 'plan' | 'agent' | 'feature' | 'file' | 'tag' | 'concept';

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

export type RelationType =
  | 'CONTAINS'
  | 'DEPENDS_ON'
  | 'MODIFIES'
  | 'IMPLEMENTS'
  | 'SIMILAR_TO'
  | 'BLOCKS'
  | 'TAGGED_WITH';

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
