import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ResourceContext } from '../types.js';
import { handlePlansIndex } from './plans-index.js';
import { handlePlanSummary } from './plans-summary.js';
import { handlePlanFull } from './plans-full.js';
import { handleDecisionsLog } from './decisions-log.js';
import { handleAgentsStatus } from './agents-status.js';

export const CORE_RESOURCE_URIS = [
  'plans://index',
  'plans://summary/*',
  'plans://full/*',
  'decisions://log',
  'agents://status',
] as const;

export const CORE_RESOURCE_NAMES = [
  'Plans Index',
  'Plan Summary',
  'Full Plan',
  'Decisions Log',
  'Agents Status',
] as const;

/**
 * Register all MCP resources with the server.
 *
 * @param server - MCP server instance
 * @param context - Resource context
 */
export function registerResources(server: McpServer, context: ResourceContext): void {
  // Store resource context on server instance for handlers to access
  (server as McpServer & { resourceContext: ResourceContext }).resourceContext = context;

  // Register each resource using the resource() method
  // Signature: resource(name: string, uri: string, readCallback: ReadResourceCallback)
  // The callback receives a URL object, not a string
  server.resource('Plans Index', 'plans://index', async () => {
    const result = await handlePlansIndex('plans://index', context);
    // Ensure text is always defined (not optional)
    return {
      contents: result.contents.map((c) => ({
        uri: c.uri,
        mimeType: c.mimeType,
        text: c.text || '',
      })),
    };
  });

  // For parameterized resources, we need to handle URI parsing
  // Register resources that can match patterns
  server.resource('Plan Summary', 'plans://summary/*', async (uri: URL) => {
    const uriString = uri.toString();
    const result = await handlePlanSummary(uriString, context);
    return {
      contents: result.contents.map((c) => ({
        uri: c.uri,
        mimeType: c.mimeType,
        text: c.text || '',
      })),
    };
  });

  server.resource('Full Plan', 'plans://full/*', async (uri: URL) => {
    const uriString = uri.toString();
    const result = await handlePlanFull(uriString, context);
    return {
      contents: result.contents.map((c) => ({
        uri: c.uri,
        mimeType: c.mimeType,
        text: c.text || '',
      })),
    };
  });

  server.resource('Decisions Log', 'decisions://log', async () => {
    const result = await handleDecisionsLog('decisions://log', context);
    return {
      contents: result.contents.map((c) => ({
        uri: c.uri,
        mimeType: c.mimeType,
        text: c.text || '',
      })),
    };
  });

  server.resource('Agents Status', 'agents://status', async () => {
    const result = await handleAgentsStatus('agents://status', context);
    return {
      contents: result.contents.map((c) => ({
        uri: c.uri,
        mimeType: c.mimeType,
        text: c.text || '',
      })),
    };
  });
}
