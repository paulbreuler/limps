interface OverviewCardProps {
  totalEntities: number;
  totalRelations: number;
  documentCount: number | undefined;
  planCount: number;
  lastIndexed: string;
}

export function OverviewCard({
  totalEntities,
  totalRelations,
  documentCount,
  planCount,
  lastIndexed,
}: OverviewCardProps): React.JSX.Element {
  return (
    <div className="card overview-card">
      <div className="card-title">Overview</div>
      {documentCount !== undefined ? (
        <div className="overview-stat">
          <span className="overview-label">Documents indexed</span>
          <span className="overview-value">{documentCount.toLocaleString()}</span>
        </div>
      ) : null}
      <div className="overview-stat">
        <span className="overview-label">Plans</span>
        <span className="overview-value">{planCount}</span>
      </div>
      <div className="overview-stat">
        <span className="overview-label">Graph entities</span>
        <span className="overview-value">{totalEntities}</span>
      </div>
      <div className="overview-stat">
        <span className="overview-label">Graph relations</span>
        <span className="overview-value">{totalRelations}</span>
      </div>
      <div className="overview-stat meta">
        <span className="overview-label">Last indexed</span>
        <span className="overview-value">{lastIndexed}</span>
      </div>
    </div>
  );
}
