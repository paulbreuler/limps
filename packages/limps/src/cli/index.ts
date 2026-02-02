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

// Registry and config management
export {
  getRegistryPath,
  loadRegistry,
  saveRegistry,
  registerProject,
  unregisterProject,
  setCurrentProject,
  getCurrentProjectPath,
  getProjectPath,
  listProjects,
  type RegisteredProject,
  type ProjectRegistry,
} from './registry.js';
export {
  configList,
  configUse,
  configShow,
  configPath,
  configAdd,
  configRemove,
  configSet,
  configDiscover,
} from './config-cmd.js';

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
