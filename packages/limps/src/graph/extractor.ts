import { existsSync, readdirSync, readFileSync, statSync } from 'fs';
import { basename, dirname, join } from 'path';
import type { Entity, EntityType, Relationship, RelationType } from './types.js';
import { PATTERNS } from './patterns.js';
import { parseFrontmatter } from './parser.js';

export interface ExtractionResult {
  entities: Entity[];
  relationships: Relationship[];
  warnings: string[];
}

function withGlobal(pattern: RegExp): RegExp {
  return new RegExp(
    pattern.source,
    pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`
  );
}

function normalizeTag(value: string): string | null {
  const cleaned = value.trim().toLowerCase();
  if (!cleaned || !/^[a-z][\w-]*$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function toAgentCanonicalId(planId: string, ref: string): string {
  const trimmed = ref.trim();
  if (/^\d{4}#\d{3}$/.test(trimmed)) {
    return `agent:${trimmed}`;
  }
  if (/^\d{3}$/.test(trimmed)) {
    return `agent:${planId}#${trimmed}`;
  }
  if (trimmed.startsWith('agent:')) {
    return trimmed;
  }
  return `agent:${planId}#${trimmed.padStart(3, '0')}`;
}

function inferPlanRoot(inputPath: string): string {
  const stats = statSync(inputPath);
  if (stats.isDirectory()) {
    return inputPath;
  }
  return dirname(inputPath);
}

function findPlanMarkdown(planRoot: string): string | null {
  const candidates = readdirSync(planRoot).filter((name) => name.toLowerCase().endsWith('.md'));
  const preferred = candidates.find((name) => /-plan\.md$/i.test(name));
  if (preferred) {
    return join(planRoot, preferred);
  }
  return candidates.length > 0 ? join(planRoot, candidates[0] as string) : null;
}

function getMatches(content: string, pattern: RegExp, captureIndex = 1): string[] {
  const values: string[] = [];
  for (const match of content.matchAll(withGlobal(pattern))) {
    const value = match[captureIndex]?.trim();
    if (value) {
      values.push(value);
    }
  }
  return values;
}

export class EntityExtractor {
  extractPlan(planPath: string): ExtractionResult {
    const result: ExtractionResult = { entities: [], relationships: [], warnings: [] };
    const now = new Date().toISOString();

    if (!existsSync(planPath)) {
      result.warnings.push(`Plan path does not exist: ${planPath}`);
      return result;
    }

    const planRoot = inferPlanRoot(planPath);
    const folderName = basename(planRoot);
    const planIdMatch = folderName.match(/^(\d{4})/);
    if (!planIdMatch?.[1]) {
      result.warnings.push(`Could not infer plan ID from folder: ${folderName}`);
      return result;
    }
    const planId = planIdMatch[1];

    const entitiesByCanonical = new Map<string, Entity>();
    const relationshipKeys = new Set<string>();
    let nextEntityId = 1;
    let nextRelationshipId = 1;

    const upsertEntity = (
      type: EntityType,
      canonicalId: string,
      name: string,
      sourcePath?: string,
      metadata: Record<string, unknown> = {}
    ): Entity => {
      const existing = entitiesByCanonical.get(canonicalId);
      if (existing) {
        if (Object.keys(metadata).length > 0) {
          existing.metadata = { ...existing.metadata, ...metadata };
        }
        return existing;
      }

      const entity: Entity = {
        id: nextEntityId++,
        type,
        canonicalId,
        name,
        sourcePath,
        metadata,
        createdAt: now,
        updatedAt: now,
      };
      entitiesByCanonical.set(canonicalId, entity);
      return entity;
    };

    const upsertRelationship = (
      sourceCanonicalId: string,
      targetCanonicalId: string,
      relationType: RelationType,
      metadata: Record<string, unknown> = {}
    ): void => {
      if (sourceCanonicalId === targetCanonicalId) {
        return;
      }
      const source = entitiesByCanonical.get(sourceCanonicalId);
      const target = entitiesByCanonical.get(targetCanonicalId);
      if (!source || !target) {
        return;
      }

      const key = `${source.canonicalId}|${target.canonicalId}|${relationType}`;
      if (relationshipKeys.has(key)) {
        return;
      }
      relationshipKeys.add(key);

      result.relationships.push({
        id: nextRelationshipId++,
        sourceId: source.id,
        targetId: target.id,
        relationType,
        confidence: 1,
        metadata,
        createdAt: now,
      });
    };

    const ensureFileEntity = (filePath: string): string => {
      const fileCanonical = `file:${filePath}`;
      upsertEntity('file', fileCanonical, filePath, filePath, {});
      return fileCanonical;
    };

    const ensureTagEntity = (tag: string, sourcePath?: string): string | null => {
      const normalized = normalizeTag(tag);
      if (!normalized) {
        return null;
      }
      const tagCanonical = `tag:${normalized}`;
      upsertEntity('tag', tagCanonical, normalized, sourcePath, {});
      return tagCanonical;
    };

    const ensureAgentEntity = (agentCanonical: string): string => {
      upsertEntity(
        'agent',
        agentCanonical,
        agentCanonical.replace(/^agent:/, 'Agent '),
        undefined,
        {}
      );
      return agentCanonical;
    };

    const linkFileReferences = (sourceCanonicalId: string, filePaths: string[]): void => {
      for (const filePath of filePaths) {
        const fileCanonical = ensureFileEntity(filePath);
        upsertRelationship(sourceCanonicalId, fileCanonical, 'MODIFIES');
      }
    };

    const linkTagReferences = (
      sourceCanonicalId: string,
      tags: string[],
      sourcePath?: string
    ): void => {
      for (const tag of tags) {
        const tagCanonical = ensureTagEntity(tag, sourcePath);
        if (tagCanonical) {
          upsertRelationship(sourceCanonicalId, tagCanonical, 'TAGGED_WITH');
        }
      }
    };

    const linkDependencyReferences = (sourceCanonicalId: string, content: string): void => {
      for (const dep of getMatches(content, PATTERNS.inlineDepends)) {
        const depCanonical = ensureAgentEntity(toAgentCanonicalId(planId, dep));
        upsertRelationship(sourceCanonicalId, depCanonical, 'DEPENDS_ON');
      }

      for (const agentMatch of content.matchAll(withGlobal(PATTERNS.agentId))) {
        const refPlanId = agentMatch[1];
        const refAgentId = agentMatch[2];
        if (!refPlanId || !refAgentId) {
          continue;
        }
        const depCanonical = ensureAgentEntity(`agent:${refPlanId}#${refAgentId}`);
        upsertRelationship(sourceCanonicalId, depCanonical, 'DEPENDS_ON');
      }

      for (const planMatch of content.matchAll(withGlobal(PATTERNS.planRef))) {
        const refPlanId = planMatch[1];
        const refAgentId = planMatch[2];
        if (!refPlanId) {
          continue;
        }

        if (refAgentId) {
          const depCanonical = ensureAgentEntity(`agent:${refPlanId}#${refAgentId}`);
          upsertRelationship(sourceCanonicalId, depCanonical, 'DEPENDS_ON');
          continue;
        }

        const refCanonical = `plan:${refPlanId}`;
        upsertEntity('plan', refCanonical, `Plan ${refPlanId}`, undefined, {});
        upsertRelationship(sourceCanonicalId, refCanonical, 'DEPENDS_ON');
      }
    };

    const extractInlineReferences = (sourceCanonicalId: string, content: string): void => {
      linkFileReferences(sourceCanonicalId, getMatches(content, PATTERNS.inlineFile));
      linkDependencyReferences(sourceCanonicalId, content);
      linkTagReferences(sourceCanonicalId, getMatches(content, PATTERNS.inlineTag));
    };

    const planMarkdownPath = findPlanMarkdown(planRoot);
    if (!planMarkdownPath || !existsSync(planMarkdownPath)) {
      result.warnings.push(`Could not locate plan markdown file in ${planRoot}`);
      return result;
    }

    const planContent = readFileSync(planMarkdownPath, 'utf8');
    const planFrontmatter = parseFrontmatter(planContent);
    const planCanonicalId = `plan:${planId}`;
    const planName =
      planFrontmatter.title ?? planContent.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? `Plan ${planId}`;

    upsertEntity('plan', planCanonicalId, planName, planMarkdownPath, {
      status: planFrontmatter.status,
    });

    linkTagReferences(planCanonicalId, planFrontmatter.tags ?? [], planMarkdownPath);

    let featureIndex = 0;
    for (const featureMatch of planContent.matchAll(withGlobal(PATTERNS.featureHeader))) {
      const featureNumber = featureMatch[1] ?? String(++featureIndex);
      const featureName = featureMatch[2]?.trim();
      if (!featureName) {
        continue;
      }
      const featureCanonical = `feature:${planId}#${featureNumber}`;
      upsertEntity('feature', featureCanonical, featureName, planMarkdownPath, {});
      upsertRelationship(planCanonicalId, featureCanonical, 'CONTAINS');
    }

    extractInlineReferences(planCanonicalId, planContent);

    const agentsDir = join(planRoot, 'agents');
    if (!existsSync(agentsDir)) {
      result.warnings.push(`Agents directory not found at ${agentsDir}`);
    } else {
      const agentFiles = readdirSync(agentsDir)
        .filter((file) => file.endsWith('.agent.md'))
        .sort();

      for (const filename of agentFiles) {
        const agentPath = join(agentsDir, filename);
        const content = readFileSync(agentPath, 'utf8');
        const frontmatter = parseFrontmatter(content);
        const agentNumber = filename.match(/^(\d{3})/)?.[1];
        if (!agentNumber) {
          result.warnings.push(`Could not infer agent number from ${filename}`);
          continue;
        }

        const agentCanonical = `agent:${planId}#${agentNumber}`;
        const agentName =
          frontmatter.title ??
          content.match(/^#\s*Agent\s+\d{3}:\s*(.+)$/m)?.[1]?.trim() ??
          `Agent ${agentNumber}`;

        upsertEntity('agent', agentCanonical, agentName, agentPath, {
          status: frontmatter.status,
          persona: frontmatter.persona,
        });
        upsertRelationship(planCanonicalId, agentCanonical, 'CONTAINS');

        for (const dep of frontmatter.depends ?? []) {
          const depCanonical = ensureAgentEntity(toAgentCanonicalId(planId, dep));
          upsertRelationship(agentCanonical, depCanonical, 'DEPENDS_ON');
        }

        linkFileReferences(
          agentCanonical,
          (frontmatter.files ?? []).map((file) => file.trim()).filter(Boolean)
        );
        linkTagReferences(agentCanonical, frontmatter.tags ?? []);

        extractInlineReferences(agentCanonical, content);
      }
    }

    result.entities = Array.from(entitiesByCanonical.values());
    return result;
  }
}
