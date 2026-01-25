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
