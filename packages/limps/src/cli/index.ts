/**
 * CLI commands for limps.
 * Provides terminal-based plan management without requiring an IDE.
 */

export { listPlans, type CliPlanEntry } from './list-plans.js';
export { listAgents, findPlanDirectory, getAgentFiles, type CliAgentEntry } from './list-agents.js';
export {
  nextTask,
  calculateDependencyScore,
  calculatePriorityScore,
  calculateWorkloadScore,
  isTaskEligible,
  scoreTask,
  type TaskScoreBreakdown,
} from './next-task.js';
export { status, getPlanStatusSummary, type PlanStatusSummary } from './status.js';
export {
  getStalenessReport,
  renderStalenessReport,
  type StalenessReport,
  type StaleEntry,
} from './health-staleness.js';

// Config management
export { configShow, configPath } from './config-cmd.js';

// JSON output utilities
export {
  wrapSuccess,
  wrapError,
  outputJson,
  isJsonMode,
  handleJsonOutput,
  type JsonSuccess,
  type JsonError,
  type JsonEnvelope,
} from './json-output.js';
