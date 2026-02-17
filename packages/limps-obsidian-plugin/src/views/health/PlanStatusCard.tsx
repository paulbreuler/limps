import type { PlanStatusInfo } from "./types.js";

interface PlanStatusCardProps {
  plans: PlanStatusInfo[];
}

function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const lower = status.toLowerCase();
  return (
    <span className={`status-badge status-${lower}`}>{status}</span>
  );
}

function agentSummary(plan: PlanStatusInfo): string {
  const counts = plan.statusCounts;
  const parts: string[] = [];
  if (counts.PASS > 0) parts.push(`${counts.PASS} PASS`);
  if (counts.WIP > 0) parts.push(`${counts.WIP} WIP`);
  if (counts.GAP > 0) parts.push(`${counts.GAP} GAP`);
  if (counts.BLOCKED > 0) parts.push(`${counts.BLOCKED} BLOCKED`);
  return `${plan.agentCount} agent${plan.agentCount !== 1 ? "s" : ""}${parts.length > 0 ? ": " + parts.join(", ") : ""}`;
}

export function PlanStatusCard({ plans }: PlanStatusCardProps): React.JSX.Element | null {
  if (plans.length === 0) return null;

  return (
    <div className="card">
      <div className="card-title">Plan Status</div>
      {plans.map((plan, index) => (
        <div className="plan-row" key={`${plan.name}-${index}`}>
          <div className="plan-header">
            <span className="plan-name">{plan.name}</span>
            <StatusBadge status={plan.status} />
          </div>
          <div className="plan-agents">{agentSummary(plan)}</div>
        </div>
      ))}
    </div>
  );
}
