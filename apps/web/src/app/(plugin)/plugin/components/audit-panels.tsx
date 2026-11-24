"use client";

import type { AuditPayload } from "../../../../lib/plugin/types";
import { HeuristicBadge, SeverityBadge, usd } from "./badges";
import { EmptyWithWhy, SimulatedLabel } from "./red-lines";
import { ScoreRing } from "./visual-patterns";

/**
 * Intent Audit panels (design v1.4 §2.4, §2.9 pattern 2): the Landing
 * Page Audit list — score ring + status badge + uplift column per
 * intent — recommendations that name intent units, and the
 * performance-billing block (Track A live, Track B the Phase II stub).
 * Uplift is a simulated demo value until re-audit deltas are measured.
 */

const STATE_BADGES: Record<AuditPayload["readiness"]["per_intent"][number]["state"], string> = {
  ready: "badge-APPROVED",
  needs_measurement: "badge-PENDING_APPROVAL",
  pending_review: "badge-PENDING_APPROVAL",
};

const STATE_LABELS: Record<AuditPayload["readiness"]["per_intent"][number]["state"], string> = {
  ready: "Deployed",
  needs_measurement: "Needs measurement",
  pending_review: "Pending review",
};

/** Pure helper: a deterministic demo uplift per intent (re-audit deltas ship later). */
function demoUplift(intentId: string): number {
  let hash = 0;
  for (const char of intentId) {
    hash = (hash * 31 + char.charCodeAt(0)) % 997;
  }
  return 2 + (hash % 40);
}

/** The Landing Page Audit list — score ring + status badge + uplift column. */
export function ReadinessList({ payload }: { payload: AuditPayload }) {
  return (
    <div className="card">
      <div className="intent-head">
        <h3>Landing Page Audit</h3>
        <HeuristicBadge />
      </div>
      {payload.readiness.per_intent.length === 0 ? (
        <EmptyWithWhy
          title="No audited intents yet."
          hint="Landing page audits run per active intent and score how ready the page is to carry it."
          why="An audit row appears once an intent unit is active and its landing page has been crawled. Draft or pending intents are not audited yet."
        />
      ) : (
        <table className="table" data-testid="audit-readiness-list">
          <thead>
            <tr>
              <th>Intent</th>
              <th>Score</th>
              <th>Status</th>
              <th>
                Readability uplift <SimulatedLabel what="demo uplift" />
              </th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {payload.readiness.per_intent.map((row) => (
              <tr key={row.intent_id}>
                <td className="intent-id">{row.intent_id}</td>
                <td>
                  <ScoreRing score={row.score} label={`${row.intent_id} readiness`} />
                </td>
                <td>
                  <span className={`badge ${STATE_BADGES[row.state]}`}>{STATE_LABELS[row.state]}</span>
                </td>
                <td>
                  {demoUplift(row.intent_id).toFixed(1)}x↑ <SimulatedLabel what="re-audit delta" />
                </td>
                <td>
                  <a href={`/plugin/intents/${row.intent_id}`}>View details</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="muted">{payload.readiness.note}</p>
    </div>
  );
}

/** What to fix, specifically — the P0/P1/P2 recommendation list. */
export function RecommendationsPanel({ payload }: { payload: AuditPayload }) {
  if (payload.recommendations.length === 0) {
    return (
      <div className="card">
        <div className="intent-head">
          <h3>What to fix, specifically</h3>
        </div>
        <EmptyWithWhy
          title="No open recommendations."
          hint="Every intent unit is reviewed and measured."
          why="Recommendations are rule-triggered per intent unit (a unit falling out of readiness). None are open right now — not that the audit failed to run."
        />
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

/** Performance billing — Track A live in the locked band, Track B the stub. */
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
            <td>{track_a.model.replaceAll("_", " ")}</td>
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
              {track_b.status}: {track_b.reason}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted">
        Billing detail per effect lives in Settings ▸ Billing and Intent Match ▸ Commission.
      </p>
    </div>
  );
}

export function AuditPanels({ payload }: { payload: AuditPayload }) {
  return (
    <>
      <ReadinessList payload={payload} />
      <RecommendationsPanel payload={payload} />
      <PerformanceBillingPanel payload={payload} />
    </>
  );
}
