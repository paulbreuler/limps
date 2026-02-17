import type { HealthViewProps } from "./health/types.js";
import { StatusLine } from "./health/StatusLine.js";
import { OverviewCard } from "./health/OverviewCard.js";
import { PlanStatusCard } from "./health/PlanStatusCard.js";
import { ActionsCard } from "./health/ActionsCard.js";
import { NotificationLog } from "./health/NotificationLog.js";

export function HealthReactView({
  snapshot,
  actionInFlight,
  daemonStartCommand,
  notifications,
  onAction,
}: HealthViewProps): React.JSX.Element {
  const state = snapshot.state;
  const disabled = actionInFlight || state === "loading";

  return (
    <div className="limps-health-view">
      <h3>Local Intelligence</h3>
      <StatusLine state={state} />
      {renderContent()}
    </div>
  );

  function renderContent(): React.JSX.Element {
    if (state === "loading") {
      return (
        <div className="cards">
          <div className="card">Waiting for limps command output...</div>
        </div>
      );
    }

    if (state === "disconnected") {
      return (
        <div className="cards">
          <div className="card">
            <div>Start the daemon first:</div>
            <pre>{daemonStartCommand}</pre>
            <div className="actions">
              <button
                type="button"
                disabled={disabled}
                onClick={() => onAction("check-daemon")}
              >
                Check daemon status
              </button>
            </div>
          </div>
        </div>
      );
    }

    if (state === "error") {
      return (
        <div className="cards">
          <div className="card">
            <pre className="error-details">
              {snapshot.message ?? "Unknown error"}
            </pre>
            <div className="actions">
              <button
                type="button"
                className="mod-cta"
                disabled={disabled}
                onClick={() => onAction("refresh-health")}
              >
                Refresh health
              </button>
            </div>
          </div>
        </div>
      );
    }

    const summary = snapshot.health?.summary;
    const totalEntities = summary?.totalEntities ?? 0;
    const totalRelations = summary?.totalRelations ?? 0;
    const lastIndexed = summary?.lastIndexed || "Never";
    const plans = snapshot.plans ?? [];

    return (
      <div className="cards">
        <ActionsCard disabled={disabled} onAction={onAction} />

        <OverviewCard
          totalEntities={totalEntities}
          totalRelations={totalRelations}
          documentCount={snapshot.documentCount}
          planCount={plans.length}
          lastIndexed={lastIndexed}
        />

        {state === "healthy-empty" ? (
          <div className="card card-warning">
            <div className="card-title">Graph Empty</div>
            <div>
              Graph has no entities yet. Run a reindex to populate.
            </div>
            <div className="actions">
              <button
                type="button"
                className="mod-cta"
                disabled={disabled}
                onClick={() => onAction("graph-reindex")}
              >
                Reindex now
              </button>
            </div>
          </div>
        ) : null}

        <PlanStatusCard plans={plans} />

        <NotificationLog entries={notifications} onAction={onAction} />
      </div>
    );
  }
}
