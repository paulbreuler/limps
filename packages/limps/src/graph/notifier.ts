import { appendFileSync } from 'fs';
import type { ConflictReport } from './conflict-detector.js';

export type NotificationChannel = 'log' | 'file' | 'webhook';

export interface NotifierConfig {
  channels: NotificationChannel[];
  filePath?: string;
  webhookUrl?: string;
}

export class Notifier {
  constructor(private readonly config: NotifierConfig) {}

  async notify(reports: ConflictReport[]): Promise<void> {
    if (reports.length === 0) return;

    for (const channel of this.config.channels) {
      switch (channel) {
        case 'log':
          this.notifyLog(reports);
          break;
        case 'file':
          this.notifyFile(reports);
          break;
        case 'webhook':
          await this.notifyWebhook(reports);
          break;
      }
    }
  }

  private notifyLog(reports: ConflictReport[]): void {
    for (const report of reports) {
      const prefix = report.severity === 'error' ? '[ERROR]' : '[WARN]';
      console.error(`${prefix} ${report.type}: ${report.message}`);
    }
  }

  private notifyFile(reports: ConflictReport[]): void {
    if (!this.config.filePath) return;

    for (const report of reports) {
      const line = JSON.stringify({
        timestamp: new Date().toISOString(),
        ...report,
      });
      appendFileSync(this.config.filePath, line + '\n', 'utf-8');
    }
  }

  private async notifyWebhook(reports: ConflictReport[]): Promise<void> {
    if (!this.config.webhookUrl) return;

    try {
      await fetch(this.config.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          conflicts: reports,
          count: reports.length,
        }),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`Webhook notification failed: ${msg}`);
    }
  }
}
