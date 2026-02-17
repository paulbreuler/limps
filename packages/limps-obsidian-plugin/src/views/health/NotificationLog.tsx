import type { ActionId, NotificationEntry } from "./types.js";

interface NotificationLogProps {
  entries: readonly NotificationEntry[];
  onAction: (action: ActionId) => void;
}

function badgeText(severity: NotificationEntry["severity"]): string {
  if (severity === "error") return "err";
  if (severity === "warning") return "warn";
  if (severity === "success") return "ok";
  return "info";
}

export function NotificationLog({
  entries,
  onAction,
}: NotificationLogProps): React.JSX.Element | null {
  if (entries.length === 0) return null;

  const recent = entries.slice(-10).reverse();

  return (
    <div className="card">
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <strong>Notification Log</strong>
        <button
          type="button"
          onClick={() => onAction("clear-notifications")}
          style={{ fontSize: "0.8em" }}
        >
          Clear
        </button>
      </div>
      <div
        className="log-entries"
        style={{ fontSize: "0.85em", marginTop: "4px" }}
      >
        {recent.map((entry, i) => {
          const time = entry.timestamp.slice(11, 19);
          return (
            <div className="log-entry" key={`${entry.timestamp}-${i}`}>
              <span className={`log-badge log-${entry.severity}`}>
                {badgeText(entry.severity)}
              </span>{" "}
              <span className="log-time">{time}</span> {entry.message}
            </div>
          );
        })}
      </div>
    </div>
  );
}
