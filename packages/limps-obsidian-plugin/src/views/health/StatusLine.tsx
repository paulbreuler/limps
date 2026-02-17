import type { HealthSnapshotState } from "./types.js";

interface StatusLineProps {
  state: HealthSnapshotState;
}

function stateLabel(state: HealthSnapshotState): string {
  if (state === "loading") return "Loading local intelligence status...";
  if (state === "disconnected")
    return "Disconnected: local intelligence daemon is not running";
  if (state === "error") return "Error fetching local intelligence status";
  if (state === "healthy-empty") return "Connected: graph index is empty";
  return "Connected: local intelligence is available";
}

function stateClass(state: HealthSnapshotState): string {
  if (state === "healthy" || state === "healthy-empty") return "healthy";
  return state;
}

export function StatusLine({ state }: StatusLineProps): React.JSX.Element {
  return (
    <div className={`status ${stateClass(state)}`}>
      {stateLabel(state)}
    </div>
  );
}
