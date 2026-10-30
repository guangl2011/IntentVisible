import type { IntentStatus, RiskLevel } from "@prisma/client";

export interface IntentCardData {
  id: string;
  actionType: string;
  riskLevel: RiskLevel;
  summary: string;
  payload: unknown;
  status: IntentStatus;
  decidedBy: string | null;
  decidedAt: Date | null;
  createdAt: Date;
  expiresAt: Date;
  outcome: { toString: () => string } | null;
  agentName?: string;
}

/** Colored pill for a risk level or intent status. */
export function Badge({ kind, value }: { kind: "risk" | "status"; value: string }) {
  return <span className={`badge badge-${value}`}>{kind === "risk" ? `${value} risk` : value}</span>;
}

function formatWhen(date: Date): string {
  return date.toISOString().replace("T", " ").slice(0, 16) + " UTC";
}

/**
 * One intent row for the queue and history pages. Payload is collapsible
 * (details/summary) so the queue stays scannable at a glance.
 */
export function IntentCard({ intent, children }: { intent: IntentCardData; children?: React.ReactNode }) {
  const payloadJson = JSON.stringify(intent.payload, null, 2);

  return (
    <article className="card intent-card" data-intent-id={intent.id}>
      <div className="intent-head">
        <Badge kind="risk" value={intent.riskLevel} />
        <Badge kind="status" value={intent.status} />
        {intent.agentName ? <span>{intent.agentName}</span> : null}
        <span className="action">{intent.actionType}</span>
      </div>
      <p className="intent-summary">{intent.summary}</p>
      <div className="intent-meta">
        Declared {formatWhen(intent.createdAt)} · Expires {formatWhen(intent.expiresAt)}
        {intent.decidedBy ? ` · Decided by ${intent.decidedBy}` : ""}
        {intent.outcome ? ` · Outcome ${intent.outcome.toString()}` : ""}
      </div>
      <details className="intent-details">
        <summary>Payload</summary>
        <pre>{payloadJson}</pre>
      </details>
      {children}
    </article>
  );
}
