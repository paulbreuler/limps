import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolContext } from '../types.js';

// Import all tool schemas and handlers
import { CreatePlanInputSchema, handleCreatePlan } from './create-plan.js';
import { UpdateTaskStatusInputSchema, handleUpdateTaskStatus } from './update-task-status.js';
import { ClaimTaskInputSchema, handleClaimTask } from './claim-task.js';
import { ReleaseTaskInputSchema, handleReleaseTask } from './release-task.js';
import { GetNextTaskInputSchema, handleGetNextTask } from './get-next-task.js';
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

/**
 * Register all MCP tools with the server.
 *
 * @param server - MCP server instance
 * @param context - Tool context with db, config, and coordination
 */
export function registerTools(server: McpServer, context: ToolContext): void {
  // Plan Management Tools
  server.tool(
    'create_plan',
    'Create a new feature plan with directory structure and agent files',
    CreatePlanInputSchema.shape,
    async (input) => {
      const parsed = CreatePlanInputSchema.parse(input);
      return handleCreatePlan(parsed, context);
    }
  );

  server.tool(
    'update_task_status',
    'Update task status (GAP → WIP → PASS/BLOCKED)',
    UpdateTaskStatusInputSchema.shape,
    async (input) => {
      const parsed = UpdateTaskStatusInputSchema.parse(input);
      return handleUpdateTaskStatus(parsed, context);
    }
  );

  // Task Coordination Tools
  server.tool(
    'claim_task',
    'Claim a task for an agent with file locks',
    ClaimTaskInputSchema.shape,
    async (input) => {
      const parsed = ClaimTaskInputSchema.parse(input);
      return handleClaimTask(parsed, context);
    }
  );

  server.tool(
    'release_task',
    'Release a claimed task and file locks',
    ReleaseTaskInputSchema.shape,
    async (input) => {
      const parsed = ReleaseTaskInputSchema.parse(input);
      return handleReleaseTask(parsed, context);
    }
  );

  // Task Selection Tools
  server.tool(
    'get_next_task',
    `Get highest-priority available task based on dependencies and agent type.

When planId is provided, returns detailed score breakdown:
- dependencyScore: 40 points max (all dependencies satisfied)
- priorityScore: 30 points max (based on agent number, lower = higher priority)
- workloadScore: 30 points max (based on file count, fewer = higher score)
- totalScore: sum of all scores (100 max)
- otherAvailableTasks: count of other eligible tasks

Without planId, searches across all plans (legacy behavior).`,
    GetNextTaskInputSchema.shape,
    async (input) => {
      const parsed = GetNextTaskInputSchema.parse(input);
      return handleGetNextTask(parsed, context);
    }
  );

  // Search Tools
  server.tool(
    'search_docs',
    'Full-text search across planning documents',
    SearchDocsInputSchema.shape,
    async (input) => {
      const parsed = SearchDocsInputSchema.parse(input);
      return handleSearchDocs(parsed, context);
    }
  );

  // Document CRUD Tools
  server.tool(
    'list_docs',
    'List files and directories in the repository',
    ListDocsInputSchema.shape,
    async (input) => {
      const parsed = ListDocsInputSchema.parse(input);
      return handleListDocs(parsed, context);
    }
  );

  server.tool(
    'create_doc',
    'Create a new document in the repository',
    CreateDocInputSchema.shape,
    async (input) => {
      const parsed = CreateDocInputSchema.parse(input);
      return handleCreateDoc(parsed, context);
    }
  );

  server.tool(
    'update_doc',
    'Update an existing document in the repository',
    UpdateDocInputBaseSchema.shape,
    async (input: unknown) => {
      const parsed = UpdateDocInputSchema.parse(input);
      return handleUpdateDoc(parsed, context);
    }
  );

  server.tool(
    'delete_doc',
    'Delete a document from the repository',
    DeleteDocInputSchema.shape,
    async (input) => {
      const parsed = DeleteDocInputSchema.parse(input);
      return handleDeleteDoc(parsed, context);
    }
  );

  // Cursor Integration Tools
  server.registerTool(
    'open_document_in_cursor',
    {
      description: 'Open a file in Cursor editor at an optional line/column position',
      inputSchema: OpenDocumentInputSchema.shape,
    },
    async (input) => {
      const parsed = OpenDocumentInputSchema.parse(input);
      return handleOpenDocumentInCursor(parsed, context);
    }
  );

  // Document Processing Tools
  server.tool(
    'process_doc',
    `Process a document with JavaScript code (read, filter, transform, extract). Can do everything read_doc does plus filtering/transformation.

Available helpers: extractSections(), extractFrontmatter(), extractCodeBlocks(), 
extractFeatures(), extractAgents(), findByPattern(), summarize()

Example:
  path: "plans/0009/plan.md"
  code: "extractFeatures(doc.content).filter(f => f.status === 'GAP')"
  
To read full content: code: "doc.content"
To read line range: code: "doc.content.split('\\n').slice(10, 20).join('\\n')"`,
    ProcessDocInputSchema.shape,
    async (input) => {
      const parsed = ProcessDocInputSchema.parse(input);
      return handleProcessDoc(parsed, context);
    }
  );

  server.tool(
    'process_docs',
    `Process multiple documents with JavaScript code for cross-document analysis. Use glob patterns or explicit paths.

Available helpers: extractSections(), extractFrontmatter(), extractCodeBlocks(),
extractFeatures(), extractAgents(), findByPattern(), summarize()

Example:
  pattern: "plans/*/plan.md"
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
  server.tool(
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

  server.tool(
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

  server.tool(
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
}
