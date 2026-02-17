import type { HealthSnapshot, HealthSnapshotState } from "../../main.js";
import type { AgentDetail, PlanStatusInfo } from "../../cli/wrapper.js";

export type { AgentDetail, HealthSnapshot, HealthSnapshotState, PlanStatusInfo };

export type ActionId =
  | "refresh-health"
  | "check-daemon"
  | "graph-reindex"
  | "convert-deps"
  | "clear-notifications";

export interface HealthViewProps {
  snapshot: HealthSnapshot;
  actionInFlight: boolean;
  daemonStartCommand: string;
  notifications: readonly NotificationEntry[];
  onAction: (action: ActionId) => void;
}

export interface NotificationEntry {
  timestamp: string;
  severity: "info" | "success" | "warning" | "error";
  message: string;
}
