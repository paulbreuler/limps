import type { McpClientManager, CallToolResult, CliOptions } from './client-manager.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractTextFromMcpResult(result: CallToolResult): string | undefined {
  if (!result.content || result.content.length === 0) return undefined;
  const textItem = result.content.find((c) => c.type === 'text');
  return textItem?.text;
}

function parseToolResult(result: CallToolResult): ToolResult {
  const text = extractTextFromMcpResult(result);

  if (result.isError) {
    return { success: false, error: text ?? 'Tool returned an error' };
  }

  if (!text) {
    return { success: true };
  }

  try {
    return { success: true, data: JSON.parse(text) };
  } catch {
    return { success: true, data: text };
  }
}

// ---------------------------------------------------------------------------
// LimpsToolWrapper
// ---------------------------------------------------------------------------

export class LimpsToolWrapper {
  constructor(
    private mcpClient: McpClientManager,
    private cliOptions: CliOptions
  ) {}

  // ---- Document tools ----

  async createDoc(
    path: string,
    content: string,
    metadata?: Record<string, unknown>
  ): Promise<ToolResult> {
    const args: Record<string, unknown> = { path, content };
    if (metadata) args.metadata = metadata;
    return this.callTool('create_doc', args);
  }

  async updateDoc(
    path: string,
    content?: string,
    metadata?: Record<string, unknown>
  ): Promise<ToolResult> {
    const args: Record<string, unknown> = { path };
    if (content !== undefined) args.content = content;
    if (metadata) args.metadata = metadata;
    return this.callTool('update_doc', args);
  }

  async deleteDoc(path: string): Promise<ToolResult> {
    return this.callTool('delete_doc', { path });
  }

  async searchDocs(query: string, limit?: number): Promise<ToolResult> {
    const args: Record<string, unknown> = { query };
    if (limit !== undefined) args.limit = limit;
    return this.callTool('search_docs', args);
  }

  async listDocs(filter?: string): Promise<ToolResult> {
    const args: Record<string, unknown> = {};
    if (filter !== undefined) args.path = filter;
    return this.callTool('list_docs', args);
  }

  // ---- Task tools ----

  async getNextTask(planId?: string): Promise<ToolResult> {
    const args: Record<string, unknown> = {};
    if (planId !== undefined) args.planId = planId;
    return this.callTool('get_next_task', args);
  }

  async updateTaskStatus(taskId: string, status: string): Promise<ToolResult> {
    return this.callTool('update_task_status', { taskId, status });
  }

  async listAgents(planId?: string): Promise<ToolResult> {
    const args: Record<string, unknown> = {};
    if (planId !== undefined) args.planId = planId;
    return this.callTool('list_agents', args);
  }

  async listPlans(): Promise<ToolResult> {
    return this.callTool('list_plans', {});
  }

  async getPlanStatus(planId: string): Promise<ToolResult> {
    return this.callTool('get_plan_status', { planId });
  }

  // ---- Health tools ----

  async checkStaleness(): Promise<ToolResult> {
    return this.callTool('check_staleness', {});
  }

  async checkDrift(): Promise<ToolResult> {
    return this.callTool('check_drift', {});
  }

  async getProposals(): Promise<ToolResult> {
    return this.callTool('get_proposals', {});
  }

  async applyProposal(proposalId: string): Promise<ToolResult> {
    return this.callTool('apply_proposal', { proposalId, confirm: true });
  }

  async inferStatus(taskId: string): Promise<ToolResult> {
    return this.callTool('infer_status', { planId: taskId });
  }

  // ---- Graph tools ----

  async graphReindex(): Promise<ToolResult> {
    return this.callTool('graph', { command: 'reindex' });
  }

  async graphHealth(): Promise<ToolResult> {
    return this.callTool('graph', { command: 'health' });
  }

  async graphSearch(query: string): Promise<ToolResult> {
    return this.callTool('graph', { command: 'search', query });
  }

  // ---- Session tools ----

  async ping(): Promise<ToolResult> {
    return this.callTool('ping', {});
  }

  // ---- Private helper ----

  private async callTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    // Prefer MCP when connected
    if (this.mcpClient.isConnected()) {
      try {
        const result = await this.mcpClient.callTool(name, args);
        return parseToolResult(result);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, error: `MCP tool '${name}' failed: ${message}` };
      }
    }

    // CLI fallback
    try {
      const data = await this.mcpClient.callToolViaCli(name, args, this.cliOptions);
      return { success: true, data };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: `CLI fallback for '${name}' failed: ${message}` };
    }
  }
}
