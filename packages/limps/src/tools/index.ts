import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { ToolFilteringConfig } from '../config.js';
import { getAllDocsPaths, getFileExtensions } from '../config.js';
import type { ToolContext, ToolResult } from '../types.js';
import { clearIndex, indexAllPaths } from '../indexer.js';

// Import all tool schemas and handlers
import { CreatePlanInputSchema, handleCreatePlan } from './create-plan.js';
import { UpdateTaskStatusInputSchema, handleUpdateTaskStatus } from './update-task-status.js';
import { GetNextTaskInputSchema, handleGetNextTask } from './get-next-task.js';
import { ConfigureScoringInputSchema, handleConfigureScoring } from './configure-scoring.js';
import { SearchDocsInputSchema, handleSearchDocs } from './search-docs.js';
import { ListDocsInputSchema, handleListDocs } from './list-docs.js';
import { CreateDocInputSchema, handleCreateDoc } from './create-doc.js';
import { UpdateDocInputSchema, UpdateDocInputBaseSchema, handleUpdateDoc } from './update-doc.js';
import { DeleteDocInputSchema, handleDeleteDoc } from './delete-doc.js';
import { OpenDocumentInputSchema, handleOpenDocumentInCursor } from './open-document-in-cursor.js';
import { ProcessDocInputSchema, handleProcessDoc } from './process-doc.js';
import {
  ProcessDocsInputBaseSchema,
  ProcessDocsInputSchema,
  handleProcessDocs,
} from './process-docs.js';
import { ListPlansInputSchema, handleListPlans } from './list-plans.js';
import { ListAgentsInputSchema, handleListAgents } from './list-agents.js';
import { GetPlanStatusInputSchema, handleGetPlanStatus } from './get-plan-status.js';
import { ManageTagsInputSchema, handleManageTags } from './manage-tags.js';
import { CheckStalenessInputSchema, handleCheckStaleness } from './check-staleness.js';
import { CheckDriftInputSchema, handleCheckDrift } from './check-drift.js';
import { InferStatusInputSchema, handleInferStatus } from './infer-status.js';
import { GetProposalsInputSchema, handleGetProposals } from './get-proposals.js';
import { ApplyProposalInputSchema, handleApplyProposal } from './apply-proposal.js';
import { GraphInputSchema, handleGraph } from './graph.js';

export const CORE_TOOL_NAMES = [
  'create_plan',
  'update_task_status',
  'get_next_task',
  'configure_scoring',
  'search_docs',
  'list_docs',
  'reindex_docs',
  'create_doc',
  'update_doc',
  'delete_doc',
  'open_document_in_cursor',
  'process_doc',
  'process_docs',
  'list_plans',
  'list_agents',
  'get_plan_status',
  'manage_tags',
  'check_staleness',
  'check_drift',
  'infer_status',
  'get_proposals',
  'apply_proposal',
  'graph',
] as const;

const ReindexDocsInputSchema = z.object({}).strict();

async function handleReindexDocs(
  _input: z.infer<typeof ReindexDocsInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { db, config } = context;
  const docsPaths = getAllDocsPaths(config);
  const fileExtensions = getFileExtensions(config);
  const ignorePatterns = ['.git', 'node_modules', '.tmp', '.obsidian'];

  clearIndex(db);
  const result = await indexAllPaths(db, docsPaths, fileExtensions, ignorePatterns);

  const output = {
    indexed: result.indexed,
    updated: result.updated,
    skipped: result.skipped,
    errors: result.errors,
    paths: docsPaths,
    extensions: fileExtensions,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(output, null, 2),
      },
    ],
  };
}

const parseToolList = (value: string | undefined): string[] | undefined => {
  if (!value) {
    return undefined;
  }
  const entries = value
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return entries.length > 0 ? entries : undefined;
};

const resolveToolFilteringConfig = (
  config: ToolFilteringConfig | undefined,
  env: NodeJS.ProcessEnv
): ToolFilteringConfig | undefined => {
  if (config) {
    return config;
  }

  const allowlist = parseToolList(env.LIMPS_ALLOWED_TOOLS);
  const denylist = parseToolList(env.LIMPS_DISABLED_TOOLS);
  if (!allowlist && !denylist) {
    return undefined;
  }

  return { allowlist, denylist };
};

export const filterToolNames = (
  toolNames: readonly string[],
  config: ToolFilteringConfig | undefined,
  env: NodeJS.ProcessEnv = process.env
): string[] => {
  const resolvedConfig = resolveToolFilteringConfig(config, env);
  if (!resolvedConfig?.allowlist && !resolvedConfig?.denylist) {
    return [...toolNames];
  }

  const available = new Set(toolNames);
  const allowlist = resolvedConfig.allowlist?.filter((name) => name.length > 0);
  const denylist = resolvedConfig.denylist?.filter((name) => name.length > 0);

  const unknownNames = [...(allowlist ?? []), ...(denylist ?? [])].filter(
    (name) => !available.has(name)
  );
  if (unknownNames.length > 0) {
    console.warn(`Unknown tool names in filter list: ${unknownNames.join(', ')}. Ignoring.`);
  }

  if (allowlist && allowlist.length > 0) {
    return allowlist.filter((name) => available.has(name));
  }

  if (denylist && denylist.length > 0) {
    const deny = new Set(denylist);
    return toolNames.filter((name) => !deny.has(name));
  }

  return [...toolNames];
};

/**
 * Register all MCP tools with the server.
 *
 * @param server - MCP server instance
 * @param context - Tool context with db and config
 */
export function registerTools(server: McpServer, context: ToolContext): void {
  const enabledTools = new Set(filterToolNames(CORE_TOOL_NAMES, context.config.tools, process.env));
  if (enabledTools.size === 0) {
    console.warn(
      '[limps] No tools were enabled after applying tool filtering configuration. ' +
        'This may indicate a misconfigured ToolFilteringConfig or LIMPS_ALLOWED_TOOLS/LIMPS_DISABLED_TOOLS.'
    );
  }
  const shouldRegisterTool = (name: string): boolean => enabledTools.has(name);
  const registerTool = (
    name: string,
    description: string,
    schema: unknown,
    handler: (input: unknown) => Promise<unknown>
  ): void => {
    if (!shouldRegisterTool(name)) {
      return;
    }
    server.tool(name, description, schema as never, handler as never);
  };
  const registerCursorTool = (
    name: string,
    description: string,
    schema: unknown,
    handler: (input: unknown) => Promise<unknown>
  ): void => {
    if (!shouldRegisterTool(name)) {
      return;
    }
    server.registerTool(
      name,
      {
        description,
        inputSchema: schema as never,
      },
      handler as never
    );
  };
  // Plan Management Tools
  registerTool(
    'create_plan',
    'Create a new feature plan with directory structure and agent files',
    CreatePlanInputSchema.shape,
    async (input) => {
      const parsed = CreatePlanInputSchema.parse(input);
      return handleCreatePlan(parsed, context);
    }
  );

  registerTool(
    'update_task_status',
    'Update agent task status in frontmatter (GAP, WIP, PASS, or BLOCKED). Task ID format: planFolder#agentNumber (e.g., "0001-feature-name#005")',
    UpdateTaskStatusInputSchema.shape,
    async (input) => {
      const parsed = UpdateTaskStatusInputSchema.parse(input);
      return handleUpdateTaskStatus(parsed, context);
    }
  );

  // Task Selection Tools
  registerTool(
    'get_next_task',
    `Get highest-priority available task based on dependencies and agent frontmatter.

Returns detailed score breakdown:
- dependencyScore: 40 points max (all dependencies satisfied)
- priorityScore: 30 points max (based on agent number, lower = higher priority)
- workloadScore: 30 points max (based on file count, fewer = higher score)
- totalScore: sum of all scores (100 max)
- otherAvailableTasks: count of other eligible tasks`,
    GetNextTaskInputSchema.shape,
    async (input) => {
      const parsed = GetNextTaskInputSchema.parse(input);
      return handleGetNextTask(parsed, context);
    }
  );

  registerTool(
    'configure_scoring',
    `Update scoring configuration.

Supports global config updates (preset/weights/biases) or scoped overrides for plan/agent frontmatter.
Use scope "plan" or "agent" with targetId to write scoring overrides to frontmatter.`,
    ConfigureScoringInputSchema.shape,
    async (input) => {
      const parsed = ConfigureScoringInputSchema.parse(input);
      return handleConfigureScoring(parsed, context);
    }
  );

  // Search Tools
  registerTool(
    'search_docs',
    'Full-text search across planning documents',
    SearchDocsInputSchema.shape,
    async (input) => {
      const parsed = SearchDocsInputSchema.parse(input);
      return handleSearchDocs(parsed, context);
    }
  );

  // Document CRUD Tools
  registerTool(
    'list_docs',
    'List files and directories in the repository',
    ListDocsInputSchema.shape,
    async (input) => {
      const parsed = ListDocsInputSchema.parse(input);
      return handleListDocs(parsed, context);
    }
  );

  registerTool(
    'reindex_docs',
    'Clear and rebuild the search index from configured docs paths',
    ReindexDocsInputSchema.shape,
    async (input) => {
      const parsed = ReindexDocsInputSchema.parse(input);
      return handleReindexDocs(parsed, context);
    }
  );

  registerTool(
    'create_doc',
    'Create a new document in the repository',
    CreateDocInputSchema.shape,
    async (input) => {
      const parsed = CreateDocInputSchema.parse(input);
      return handleCreateDoc(parsed, context);
    }
  );

  registerTool(
    'update_doc',
    'Update an existing document in the repository',
    UpdateDocInputBaseSchema.shape,
    async (input: unknown) => {
      const parsed = UpdateDocInputSchema.parse(input);
      return handleUpdateDoc(parsed, context);
    }
  );

  registerTool(
    'delete_doc',
    'Delete a document from the repository',
    DeleteDocInputSchema.shape,
    async (input) => {
      const parsed = DeleteDocInputSchema.parse(input);
      return handleDeleteDoc(parsed, context);
    }
  );

  // Cursor Integration Tools
  registerCursorTool(
    'open_document_in_cursor',
    'Open a file in Cursor editor at an optional line/column position',
    OpenDocumentInputSchema.shape,
    async (input) => {
      const parsed = OpenDocumentInputSchema.parse(input);
      return handleOpenDocumentInCursor(parsed, context);
    }
  );

  // Document Processing Tools
  registerTool(
    'process_doc',
    `Process a document with JavaScript code (read, filter, transform, extract). Can do everything read_doc does plus filtering/transformation.

Available helpers: extractSections(), extractFrontmatter(), extractCodeBlocks(), 
extractFeatures(), extractAgents(), findByPattern(), summarize()

Example:
  path: "plans/0009-feature/0009-feature-plan.md"
  code: "extractFeatures(doc.content).filter(f => f.status === 'GAP')"
  
To read full content: code: "doc.content"
To read line range: code: "doc.content.split('\\n').slice(10, 20).join('\\n')"`,
    ProcessDocInputSchema.shape,
    async (input) => {
      const parsed = ProcessDocInputSchema.parse(input);
      return handleProcessDoc(parsed, context);
    }
  );

  registerTool(
    'process_docs',
    `Process multiple documents with JavaScript code for cross-document analysis. Use glob patterns or explicit paths.

Available helpers: extractSections(), extractFrontmatter(), extractCodeBlocks(),
extractFeatures(), extractAgents(), findByPattern(), summarize()

Example:
  pattern: "plans/*/*-plan.md"
  code: "docs.map(d => ({ name: extractFrontmatter(d.content).meta.name, features: extractFeatures(d.content).length }))"`,
    ProcessDocsInputBaseSchema.shape,
    async (input: unknown) => {
      try {
        const parsed = ProcessDocsInputSchema.parse(input);
        return handleProcessDocs(parsed, context);
      } catch (error) {
        // Handle Zod validation errors
        if (error && typeof error === 'object' && 'issues' in error) {
          const zodError = error as { issues: { message: string }[] };
          return {
            content: [
              {
                type: 'text',
                text: `Validation error: ${zodError.issues.map((i) => i.message).join(', ')}`,
              },
            ],
            isError: true,
          };
        }
        throw error;
      }
    }
  );

  // Plan Overview Tools (aligned with CLI experience)
  registerTool(
    'list_plans',
    `List all plans with overview information. Returns structured data including:
- number: Plan number (e.g., "0001")
- name: Human-readable name
- workType: feature | bug | refactor | docs | unknown
- overview: Brief description (max 100 chars)
- status: GAP | WIP | PASS | BLOCKED

Use this to get an overview of all available plans before diving into a specific one.`,
    ListPlansInputSchema.shape,
    async (input) => {
      const parsed = ListPlansInputSchema.parse(input);
      return handleListPlans(parsed, context);
    }
  );

  registerTool(
    'list_agents',
    `List all agents for a specific plan with status and metadata. Returns:
- agentNumber: Agent identifier (e.g., "000")
- taskId: Full task ID (e.g., "0001-plan-name#000")
- title: Agent/task title
- status: GAP | WIP | PASS | BLOCKED
- persona: coder | reviewer | pm | customer
- dependencyCount: Number of dependencies
- fileCount: Number of files to modify

Also includes statusCounts summary showing how many agents are in each status.`,
    ListAgentsInputSchema.shape,
    async (input) => {
      const parsed = ListAgentsInputSchema.parse(input);
      return handleListAgents(parsed, context);
    }
  );

  registerTool(
    'get_plan_status',
    `Get plan progress summary with completion percentage. Returns:
- planName: Full plan directory name
- totalAgents: Total number of agents
- completionPercentage: % of agents with PASS status
- statusCounts: Breakdown by status (GAP, WIP, PASS, BLOCKED)
- personaCounts: Breakdown by persona (coder, reviewer, pm, customer)
- blockedAgents: List of blocked agents with IDs and titles
- wipAgents: List of in-progress agents with IDs and titles

Use this to understand overall progress and identify blockers.`,
    GetPlanStatusInputSchema.shape,
    async (input) => {
      const parsed = GetPlanStatusInputSchema.parse(input);
      return handleGetPlanStatus(parsed, context);
    }
  );

  registerTool(
    'check_staleness',
    'Report stale plans and agents based on staleness policy',
    CheckStalenessInputSchema.shape,
    async (input) => {
      const parsed = CheckStalenessInputSchema.parse(input);
      return handleCheckStaleness(parsed, context);
    }
  );

  // Tag Management Tool
  registerCursorTool(
    'manage_tags',
    `Add, remove, or list tags in a document. Tags can be in frontmatter (tags: [...]) or inline (#tag).

Operations:
- list: List all tags (from frontmatter and inline)
- add: Add tags to the document (deduplicates automatically)
- remove: Remove tags from the document

Tags are stored in frontmatter. Inline tags (#tag) are detected but stored in frontmatter.`,
    ManageTagsInputSchema.shape,
    async (input) => {
      const parsed = ManageTagsInputSchema.parse(input);
      return handleManageTags(parsed, context);
    }
  );

  // Health Check Tools
  registerTool(
    'check_drift',
    `Check for code drift between agent frontmatter file lists and actual filesystem.

Detects:
- Missing files: Listed in frontmatter but not found on disk
- Renamed files: Missing files with fuzzy-matched suggestions

Returns:
- status: "clean" or "drift_detected"
- agentsChecked: Number of agents checked
- totalFilesChecked: Number of file references checked
- skippedExternal: Files with external repo references (skipped)
- drifts: Array of drift entries with taskId, file, reason, and suggestion

Use this to verify agent file references are up-to-date with the codebase.`,
    CheckDriftInputSchema.shape,
    async (input) => {
      const parsed = CheckDriftInputSchema.parse(input);
      return handleCheckDrift(parsed, context);
    }
  );

  registerTool(
    'infer_status',
    `Suggest status updates for plan agents based on conservative rules. Inference is suggest-only; never auto-applies.

Rules (examples):
- Any → BLOCKED: Agent body mentions "blocked" or "waiting"
- WIP → PASS: All dependencies are PASS (low confidence)

Returns:
- agentsChecked: Number of agents checked
- suggestionCount: Number of suggestions
- suggestions: Array of { taskId, currentStatus, suggestedStatus, confidence, reasons }

Use minConfidence (0–1) to filter low-confidence suggestions.`,
    InferStatusInputSchema.shape,
    async (input) => {
      const parsed = InferStatusInputSchema.parse(input);
      return handleInferStatus(parsed, context);
    }
  );

  registerTool(
    'get_proposals',
    'List update proposals from staleness, drift, and inference. Use apply_proposal to apply with confirmation.',
    GetProposalsInputSchema.shape,
    async (input) => {
      const parsed = GetProposalsInputSchema.parse(input);
      return handleGetProposals(parsed, context);
    }
  );

  registerTool(
    'apply_proposal',
    'Apply a single proposal by id. Requires confirm: true. Creates a backup before modifying.',
    ApplyProposalInputSchema.shape,
    async (input) => {
      const parsed = ApplyProposalInputSchema.parse(input);
      return handleApplyProposal(parsed, context);
    }
  );

  // Knowledge Graph Tool (single entry point for all graph operations)
  registerTool(
    'graph',
    `Query and manage the knowledge graph of plans, agents, features, and their relationships.

Commands:
- health: Get graph statistics and conflict summary
- search: Search entities (requires: query. optional: topK, recipe)
- trace: Trace entity relationships (requires: entityId. optional: direction, depth)
- entity: Get details for a specific entity (requires: entityId)
- overlap: Find overlapping features (optional: planId, threshold)
- reindex: Rebuild graph from plan files (optional: planId, incremental)
- check: Run conflict detection (optional: type — file_contention|feature_overlap|circular_dependency|stale_wip)
- suggest: Get suggestions (requires: type — consolidate|next-task. optional: planId)

Entity ID format: type:id (e.g. plan:0042, agent:0042#003, feature:0042#1)

For full CLI usage run \`limps graph <command> --help\`.`,
    GraphInputSchema.shape,
    async (input) => {
      const parsed = GraphInputSchema.parse(input);
      return handleGraph(parsed, context);
    }
  );
}
