/**
 * MCP tools for limps-radix extension.
 */

export {
  listPrimitivesTool,
  handleListPrimitives,
  type ListPrimitivesInput,
  type ListPrimitivesOutput,
} from './list-primitives.js';

export {
  extractPrimitiveTool,
  handleExtractPrimitive,
  type ExtractPrimitiveInput,
  type ExtractPrimitiveOutput,
} from './extract-primitive.js';

export {
  analyzeComponentTool,
  handleAnalyzeComponent,
  type AnalyzeComponentInput,
} from './analyze-component.js';

export {
  diffVersionsTool,
  diffVersionsInputSchema,
  handleDiffVersions,
  type DiffVersionsInput,
  type DiffVersionsOutput,
} from './diff-versions.js';

export {
  checkUpdatesTool,
  checkUpdatesInputSchema,
  handleCheckUpdates,
  type CheckUpdatesInput,
  type CheckUpdatesOutput,
} from './check-updates.js';

export {
  runAuditTool,
  runAuditInputSchema,
  handleRunAudit,
  type RunAuditInput,
} from './run-audit.js';

export {
  generateReportTool,
  generateReportInputSchema,
  handleGenerateReport,
  type GenerateReportInput,
} from './generate-report.js';
