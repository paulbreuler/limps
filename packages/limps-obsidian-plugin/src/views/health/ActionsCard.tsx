import type { ActionId } from "./types.js";

interface ActionsCardProps {
  disabled: boolean;
  onAction: (action: ActionId) => void;
}

export function ActionsCard({
  disabled,
  onAction,
}: ActionsCardProps): React.JSX.Element {
  return (
    <div className="card actions-row">
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction("refresh-health")}
      >
        Refresh
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction("check-daemon")}
      >
        Check daemon
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction("graph-reindex")}
      >
        Reindex
      </button>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onAction("convert-deps")}
      >
        Convert deps
      </button>
    </div>
  );
}