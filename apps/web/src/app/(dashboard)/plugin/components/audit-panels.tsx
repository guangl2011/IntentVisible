import type { AuditPayload } from "../../../../lib/plugin/types";
import { HeuristicBadge, SeverityBadge, usd } from "./badges";

/**
 * Intent Audit panels (design v1.4 §2.4): readiness as a heuristic,
 * recommendations that reference specific intent units, and the
 * performance-billing block — Track A commission rates shown within the
 * locked 5–20% band, Track B rendered as the Phase II stub it is.
 */

const STATE_LABELS: Record<AuditPayload["readiness"]["per_intent"][number]["state"], string> = {
  ready: "Ready",
  needs_measurement: "Needs measurement",
  pending_review: "Pending review",
};

export function ReadinessPanel({ payload }: { payload: AuditPayload }) {
  return (
    <div className="card">
      <div className="intent-head">
        <h3>Landing page readiness</h3>
        <HeuristicBadge />
      </div>
      <table className="table">
        <thead>
          <tr>
            <th>Intent</th>
            <th>State</th>
            <th>Heuristic score</th>
          </tr>
        </thead>
        <tbody>
          {payload.readiness.per_intent.map((row) => (
            <tr key={row.intent_id}>
              <td className="intent-id">{row.intent_id}</td>
              <td>{STATE_LABELS[row.state]}</td>
              <td>{row.score}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="muted">{payload.readiness.note}</p>
    </div>
  );
}

export function RecommendationsPanel({ payload }: { payload: AuditPayload }) {
  if (payload.recommendations.length === 0) {
    return (
      <div className="card empty-card">
        <strong>No open recommendations.</strong>
        <p className="muted">
          Every intent unit is reviewed and measured. New recommendations appear here when a unit falls out
          of readiness.
        </p>
      </div>
    );
  }
  return (
    <div className="card">
      <div className="intent-head">
        <h3>What to fix, specifically</h3>
      </div>
      <ul className="recommendation-list">
        {payload.recommendations.map((rec) => (
          <li key={`${rec.intent_id}-${rec.recommendation}`}>
            <SeverityBadge severity={rec.priority} /> <span className="intent-id">{rec.intent_id}</span> —{" "}
            {rec.recommendation}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function PerformanceBillingPanel({ payload }: { payload: AuditPayload }) {
  const { track_a, track_b } = payload.performance_billing;
  return (
    <div className="card">
      <div className="intent-head">
        <h3>Performance billing</h3>
      </div>
      <p className="muted">
        Free install, pay only for performance. Track A bills per attributed order at a rate in the locked
        5–20% band; Track B (ad-optimization effect fees) bills only after verified baselines exist.
      </p>
      <table className="table">
        <thead>
          <tr>
            <th>Track</th>
            <th>Model</th>
            <th>Rate</th>
            <th>Gross</th>
            <th>Refund offsets</th>
            <th>Net</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Track A — order-attribution commission</td>
            <td>{track_a.model.replace(/_/g, " ")}</td>
            <td>
              {(track_a.rate_band.min * 100).toFixed(0)}%–{(track_a.rate_band.max * 100).toFixed(0)}% (tiered)
            </td>
            <td>{usd(track_a.gross)}</td>
            <td>{usd(track_a.refunds)}</td>
            <td>{usd(track_a.net)}</td>
          </tr>
          <tr>
            <td>Track B — ad-optimization effect fee</td>
            <td colSpan={5} className="muted">
              Phase II stub — {track_b.reason}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export function AuditPanels({ payload }: { payload: AuditPayload }) {
  return (
    <>
      <ReadinessPanel payload={payload} />
      <RecommendationsPanel payload={payload} />
      <PerformanceBillingPanel payload={payload} />
    </>
  );
}
