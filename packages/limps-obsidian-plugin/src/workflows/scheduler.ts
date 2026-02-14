import type { LimpsRunOptions } from '../cli/wrapper.js';
import { getDaemonStatus, getGraphHealth } from '../cli/wrapper.js';

export interface HealthCheckResult {
  check: 'staleness' | 'drift' | 'conflict';
  issues: number;
  details: string;
  timestamp: string;
}

export class WorkflowScheduler {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly getRunOptions: () => LimpsRunOptions;
  private readonly onResults: (results: HealthCheckResult[]) => void;

  constructor(
    getRunOptions: () => LimpsRunOptions,
    onResults: (results: HealthCheckResult[]) => void
  ) {
    this.getRunOptions = getRunOptions;
    this.onResults = onResults;
  }

  start(intervalMs: number): void {
    this.stop();
    this.intervalId = setInterval(() => {
      void this.runNow();
    }, intervalMs);
  }

  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  isRunning(): boolean {
    return this.intervalId !== null;
  }

  async runNow(): Promise<HealthCheckResult[]> {
    const options = this.getRunOptions();
    const timestamp = new Date().toISOString();
    const results: HealthCheckResult[] = [];

    const daemonResult = await getDaemonStatus(options);
    if (!daemonResult.ok || !daemonResult.daemon?.running) {
      results.push({
        check: 'staleness',
        issues: 1,
        details: 'Daemon is not running; cannot check staleness.',
        timestamp,
      });
      this.onResults(results);
      return results;
    }

    const healthResult = await getGraphHealth(options);
    if (!healthResult.ok || !healthResult.health) {
      results.push({
        check: 'staleness',
        issues: 1,
        details: healthResult.error ?? 'Failed to fetch graph health.',
        timestamp,
      });
      this.onResults(results);
      return results;
    }

    const summary = healthResult.health.summary;

    results.push({
      check: 'staleness',
      issues: summary.warningCount,
      details:
        summary.warningCount > 0
          ? `${summary.warningCount} warning(s) detected in graph.`
          : 'No staleness warnings.',
      timestamp,
    });

    results.push({
      check: 'conflict',
      issues: summary.conflictCount,
      details:
        summary.conflictCount > 0
          ? `${summary.conflictCount} conflict(s) detected in graph.`
          : 'No conflicts.',
      timestamp,
    });

    results.push({
      check: 'drift',
      issues: summary.errorCount,
      details:
        summary.errorCount > 0
          ? `${summary.errorCount} error(s) detected in graph.`
          : 'No drift errors.',
      timestamp,
    });

    this.onResults(results);
    return results;
  }
}
