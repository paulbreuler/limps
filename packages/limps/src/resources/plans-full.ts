import { readFileSync } from 'fs';
import { join } from 'path';
import type { ResourceContext, ResourceResult } from '../types.js';
import { findPlanFile } from '../utils/paths.js';

/**
 * Handle plans://full/{planId} resource request.
 * Returns complete plan content (lazy-loaded, only when explicitly requested).
 *
 * @param uri - Resource URI (should be 'plans://full/{planId}')
 * @param context - Resource context
 * @returns Resource result with full plan content
 */
export async function handlePlanFull(
  uri: string,
  context: ResourceContext
): Promise<ResourceResult> {
  const { config } = context;
  const plansPath = config.plansPath;

  // Extract planId from URI (plans://full/{planId})
  const match = uri.match(/^plans:\/\/full\/(.+)$/);
  if (!match) {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: 'Invalid URI format',
        },
      ],
    };
  }

  const planId = match[1];
  const planPath = join(plansPath, planId);
  const planMdPath = findPlanFile(planPath);

  // Check if plan exists
  if (!planMdPath) {
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Plan not found: ${planId}`,
        },
      ],
    };
  }

  try {
    // Read plan content directly from file (UTF-8)
    const content = readFileSync(planMdPath, 'utf-8');

    // Large files may exceed MCP message size limits
    // For now, we return the content as-is
    // In production, might want to chunk or truncate very large files

    return {
      contents: [
        {
          uri,
          mimeType: 'text/markdown',
          text: content,
        },
      ],
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      contents: [
        {
          uri,
          mimeType: 'text/plain',
          text: `Error reading plan: ${errorMessage}`,
        },
      ],
    };
  }
}
