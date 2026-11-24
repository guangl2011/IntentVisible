"use client";

import type { AuditPayload } from "../../../../lib/plugin/types";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { HeuristicBadge, SeverityBadge, usd } from "./badges";
import { EmptyWithWhy, SimulatedLabel } from "./red-lines";
import { ScoreRing } from "./visual-patterns";

/**
 * Intent Audit panels (design v1.4 §2.4, §2.9 pattern 2): the Landing
 * Page Audit list — score ring + status badge + uplift column per
 * intent — recommendations that name intent units, and the
 * performance-billing block (Track A live, Track B the Phase II stub).
 * Uplift is a simulated demo value until re-audit deltas are measured.
 * All copy renders through the dictionary (design v1.5 §0.6 rule 2).
 */

const STATE_BADGES: Record<AuditPayload["readiness"]["per_intent"][number]["state"], string> = {
  ready: "badge-APPROVED",
  needs_measurement: "badge-PENDING_APPROVAL",
  pending_review: "badge-PENDING_APPROVAL",
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
  const t = useT();
  return (
    <div className="card">
      <div className="intent-head">
        <h3>{t.audit.readiness.title}</h3>
        <HeuristicBadge />
      </div>
      {payload.readiness.per_intent.length === 0 ? (
        <EmptyWithWhy
          title={t.audit.readiness.empty.title}
          hint={t.audit.readiness.empty.hint}
          why={t.audit.readiness.empty.why}
        />
      ) : (
        <table className="table" data-testid="audit-readiness-list">
          <thead>
            <tr>
              <th>{t.audit.readiness.headers.intent}</th>
              <th>{t.audit.readiness.headers.score}</th>
              <th>{t.audit.readiness.headers.status}</th>
              <th>
                {t.audit.readiness.headers.uplift} <SimulatedLabel what={t.simLabels.reauditDelta} />
              </th>
              <th>{t.audit.readiness.headers.action}</th>
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
                  <span className={`badge ${STATE_BADGES[row.state]}`}>{t.audit.readiness.states[row.state]}</span>
                </td>
                <td>
                  {demoUplift(row.intent_id).toFixed(1)}x↑ <SimulatedLabel what={t.simLabels.reauditDelta} />
                </td>
                <td>
                  <a href={`/plugin/intents/${row.intent_id}`}>{t.audit.readiness.viewDetails}</a>
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
  const t = useT();
  if (payload.recommendations.length === 0) {
    return (
      <div className="card">
        <div className="intent-head">
          <h3>{t.audit.recommendations.title}</h3>
        </div>
        <EmptyWithWhy
          title={t.audit.recommendations.empty.title}
          hint={t.audit.recommendations.empty.hint}
          why={t.audit.recommendations.empty.why}
        />
      </div>
    );
  }
  return (
    <div className="card">
      <div className="intent-head">
        <h3>{t.audit.recommendations.title}</h3>
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
  const t = useT();
  const { track_a, track_b } = payload.performance_billing;
  return (
    <div className="card">
      <div className="intent-head">
        <h3>{t.audit.billing.title}</h3>
      </div>
      <p className="muted">{t.audit.billing.intro}</p>
      <table className="table">
        <thead>
          <tr>
            <th>{t.audit.billing.headers.track}</th>
            <th>{t.audit.billing.headers.model}</th>
            <th>{t.audit.billing.headers.rate}</th>
            <th>{t.audit.billing.headers.gross}</th>
            <th>{t.audit.billing.headers.refunds}</th>
            <th>{t.audit.billing.headers.net}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t.audit.billing.trackA}</td>
            <td>{track_a.model.replaceAll("_", " ")}</td>
            <td>
              {(track_a.rate_band.min * 100).toFixed(0)}%–{(track_a.rate_band.max * 100).toFixed(0)}%{" "}
              ({t.audit.billing.tiered})
            </td>
            <td>{usd(track_a.gross)}</td>
            <td>{usd(track_a.refunds)}</td>
            <td>{usd(track_a.net)}</td>
          </tr>
          <tr>
            <td>{t.audit.billing.trackB}</td>
            <td colSpan={5} className="muted">
              {track_b.status}: {track_b.reason}
            </td>
          </tr>
        </tbody>
      </table>
      <p className="muted">{t.audit.billing.detailNote}</p>
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
