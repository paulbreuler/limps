// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type NotificationSeverity = 'info' | 'warning' | 'error' | 'success';

export interface NotificationEntry {
  severity: NotificationSeverity;
  message: string;
  timestamp: string;
}

export type ShowNoticeFn = (message: string, timeoutMs: number) => void;

// ---------------------------------------------------------------------------
// NotificationManager
// ---------------------------------------------------------------------------

const NOTICE_TIMEOUT: Record<NotificationSeverity, number> = {
  info: 3000,
  success: 4000,
  warning: 7000,
  error: 10000,
};

const MAX_LOG_SIZE = 200;

export class NotificationManager {
  private readonly log: NotificationEntry[] = [];
  private readonly showNotice: ShowNoticeFn;

  constructor(showNotice?: ShowNoticeFn) {
    this.showNotice = showNotice ?? (() => {});
  }

  notify(severity: NotificationSeverity, message: string): void {
    const entry: NotificationEntry = {
      severity,
      message,
      timestamp: new Date().toISOString(),
    };

    this.log.push(entry);
    if (this.log.length > MAX_LOG_SIZE) {
      this.log.splice(0, this.log.length - MAX_LOG_SIZE);
    }

    this.showNotice(message, NOTICE_TIMEOUT[severity]);
  }

  getLog(): readonly NotificationEntry[] {
    return this.log;
  }

  clearLog(): void {
    this.log.length = 0;
  }
}
