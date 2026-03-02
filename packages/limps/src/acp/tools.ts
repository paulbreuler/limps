import type { AcpSessionManager } from './session-manager.js';
import type {
  ClaimTaskRequest,
  ClaimTaskResponse,
  UpdateStatusRequest,
  UpdateStatusResponse,
  ListTasksRequest,
} from './types.js';

export interface AcpToolContext {
  sessionManager: AcpSessionManager;
}

export interface AcpTools {
  claim_task: (req: ClaimTaskRequest) => Promise<ClaimTaskResponse>;
  update_status: (req: UpdateStatusRequest) => Promise<UpdateStatusResponse>;
  create_artifact: (req: Record<string, unknown>) => Promise<Record<string, unknown>>;
  validate_invest: (req: { content: string }) => Promise<Record<string, unknown>>;
  list_tasks: (req: ListTasksRequest) => Promise<unknown[]>;
}

export function createAcpTools(context: AcpToolContext): AcpTools {
  return {
    async claim_task(req: ClaimTaskRequest): Promise<ClaimTaskResponse> {
      // TODO: Query DB for next GAP task in planId
      return {
        taskId: req.planId ? `${req.planId}#000` : 'unknown',
        title: 'Unclaimed task',
        frontmatter: {},
        primerContent: null,
        files: [],
      };
    },

    async update_status(req: UpdateStatusRequest): Promise<UpdateStatusResponse> {
      context.sessionManager.updateTaskStatus(req.taskId, req.status);
      return { ok: true, taskId: req.taskId, status: req.status };
    },

    async create_artifact(req: Record<string, unknown>): Promise<Record<string, unknown>> {
      return {
        ok: true,
        message: 'Artifact creation delegated to AI agent',
        request: req,
      };
    },

    async validate_invest(_req: { content: string }): Promise<Record<string, unknown>> {
      // Basic validation stub - will integrate with invest.ts from Phase 2
      return {
        score: 0,
        warnings: ['INVEST validation not yet connected to document model'],
      };
    },

    async list_tasks(_req: ListTasksRequest): Promise<unknown[]> {
      // TODO: Query DB for tasks
      return [];
    },
  };
}
