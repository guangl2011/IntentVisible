import Link from "next/link";

import type {
  AttributionPayload,
  MatchPayload,
  OverviewPayload,
  PluginAlert,
} from "../../../../lib/plugin/types";
import { LLMS_TXT_STATUS } from "../../../../lib/plugin/demo-fixtures";
import { SeverityBadge } from "./badges";
import { EmptyWithWhy, SimulatedLabel, SourceLabel } from "./red-lines";
import { GaugeWithSubScores } from "./visual-patterns";

/**
 * Overview page — exactly four blocks in order (design v1.4 §2.2):
 * Today's Alert, the Agentic Store Summary, the Intent Health Score
 * gauge, and the attribution shortcut cards. Every block carries its
 * source labels (实测 / 归因模型 / 平台自报) and the blocks the API
 * cannot back yet wear the simulated chip.
 */

const REASON_LABELS: Record<PluginAlert["reason_kind"], string> = {
  first_intent_attributed_order: "Milestone — first intent-attributed order",
  intent_pending_review: "Review queue",
  refund_offset_recorded: "Billing integrity",
  single_day_snapshot: "Measurement quality",
  visibility_not_measured: "Measurement gap",
};

/** Pure helper: the 72h auto-approve countdown copy for a pending-review alert. */
function pendingReviewCountdown(alert: PluginAlert): string {
  return `72h auto-approve countdown running — auto-approves within 72 hours of submission (submitted as ${alert.intent_id ?? "intent"}).`;
}

/**
 * Pure helper: the Intent Drop-off rule — affiliate traffic is arriving
 * but orders are not. Derived from measured visit/order joins, so the
 * warning only fires on real data.
 */
export function intentDropOffWarning(
  payload: MatchPayload,
): { sessions: number; orders: number } | null {
  const visits = payload.affiliate_visits.length;
  const orders = payload.affiliate_visits.filter((visit) => visit.order_id !== null).length;
  if (visits === 0 || orders > 0) return null;
  return { sessions: visits, orders };
}

/** Block 1 — Today's Alert: rule-triggered, priority-sorted cards. */
export function TodaysAlertBlock({
  alerts,
  dropOff,
}: {
  alerts: PluginAlert[];
  dropOff: { sessions: number; orders: number } | null;
}) {
  const hasMilestone = alerts.some((alert) => alert.reason_kind === "first_intent_attributed_order");
  const isEmpty = alerts.length === 0 && dropOff === null;

  if (isEmpty) {
    return (
      <section className="overview-block" data-block="todays-alert">
        <h2>Today's Alert</h2>
        <EmptyWithWhy
          title="No alerts today."
          hint="Nothing needs your attention: no pending reviews, no measurement gaps, no billing surprises."
          why="Alerts are rule-triggered: one fires the day its rule matches (a review expiring, a refund landing, a measurement gap opening). An empty day means no rule matched, not that the page failed to load."
        />
      </section>
    );
  }

  return (
    <section className="overview-block" data-block="todays-alert">
      <h2>Today's Alert</h2>
      <div className="alert-list">
        {alerts.map((alert) => (
          <div key={alert.alert_id} className="card alert-card">
            <div className="intent-head">
              <strong>
                <SeverityBadge severity={alert.severity} /> {REASON_LABELS[alert.reason_kind]}
              </strong>
              {alert.reason_kind === "first_intent_attributed_order" ? (
                <span className="badge badge-milestone">🎉 milestone</span>
              ) : null}
            </div>
            <p>{alert.reason}</p>
            {alert.reason_kind === "intent_pending_review" ? (
              <p className="countdown" data-testid="auto-approve-countdown">
                ⏳ {pendingReviewCountdown(alert)}
              </p>
            ) : null}
          </div>
        ))}
        {dropOff !== null ? (
          <div className="card alert-card dropoff-card" data-testid="intent-dropoff-warning">
            <div className="intent-head">
              <strong>
                <SeverityBadge severity="p1" /> Intent Drop-off warning
              </strong>
              <SourceLabel kind="measured" />
            </div>
            <p>
              {dropOff.sessions} affiliate visits arrived but {dropOff.orders} converted to orders. The
              landing intent pages are persuading poorly, or price / shipping thresholds are stopping the
              checkout — start with the Attribution ▸ Channel Quality view to see which channel leaks.
            </p>
            <Link href="/plugin/attribution#channel-quality">Open Channel Quality diagnosis →</Link>
          </div>
        ) : null}
        {hasMilestone ? (
          <p className="muted">
            First intent-attributed order milestone: pushed the day the ledger records your first
            intent-linked sale.
          </p>
        ) : null}
      </div>
    </section>
  );
}

/** Block 2 — Agentic Store Summary: one paragraph + key numbers. */
export function StoreSummaryBlock({ summary }: { summary: OverviewPayload["agentic_store_summary"] }) {
  return (
    <section className="overview-block" data-block="agentic-summary">
      <h2>Agentic Store Summary</h2>
      <div className="card">
        <p>{summary.summary_text}</p>
        <div className="stat-grid">
          <div className="stat">
            <span className="stat-value">{summary.key_numbers.persona_count}</span>
            <span className="muted">personas (map size)</span> <SourceLabel kind="measured" />
          </div>
          <div className="stat">
            <span className="stat-value">{summary.key_numbers.active_intent_count}</span>
            <span className="muted">active intents</span> <SourceLabel kind="measured" />
          </div>
          <div className="stat">
            <span className="stat-value">{summary.key_numbers.ai_referral_sessions_7d}</span>
            <span className="muted">AI / affiliate sessions (7d)</span> <SourceLabel kind="measured" />
          </div>
          <div className="stat">
            <span className="stat-value stat-text">live</span>
            <span className="muted">{LLMS_TXT_STATUS}</span> <SimulatedLabel what="llms.txt status" />
          </div>
        </div>
        <p className="muted provenance-footer">
          Generated by {summary.provenance.generated_by} · data window {summary.provenance.data_window_start} →{" "}
          {summary.provenance.data_window_end}
        </p>
      </div>
    </section>
  );
}

/** Pure helper: the three §2.2 sub-scores from the overview + audit payloads. */
export function healthSubScores(
  overview: OverviewPayload,
  pageReadiness: number | null,
): { label: string; score: number; detail: string; href: string }[] {
  const coverage = overview.intent_health_score.components.find(
    (component) => component.key === "intent_coverage",
  );
  const measurement = overview.intent_health_score.components.find(
    (component) => component.key === "measurement_coverage",
  );
  const attribution = overview.intent_health_score.components.find(
    (component) => component.key === "attribution_health",
  );
  const dataHealth =
    measurement && attribution ? Math.round((measurement.score + attribution.score) / 2) : null;

  return [
    {
      label: "意图覆盖 · Intent coverage",
      score: coverage?.score ?? 0,
      detail: coverage?.detail ?? "Coverage components not measured yet.",
      href: "/plugin/intents",
    },
    {
      label: "页面承接 · Page readiness",
      score: pageReadiness ?? 0,
      detail: pageReadiness === null ? "Landing page audit has not scored any intent yet." : "Average readiness across audited intents.",
      href: "/plugin/audit",
    },
    {
      label: "数据健康 · Data health",
      score: dataHealth ?? 0,
      detail: attribution?.detail ?? "Pixel coverage, UTM attribution share, and discount-code anchoring.",
      href: "/plugin/attribution",
    },
  ];
}

/** Pure helper: mean of a readiness score list, or null when nothing is scored. */
export function averageReadiness(
  perIntent: { score: number }[],
): number | null {
  if (perIntent.length === 0) return null;
  return Math.round(perIntent.reduce((sum, row) => sum + row.score, 0) / perIntent.length);
}

/** Block 3 — Intent Health Score: gauge + expandable, linked sub-scores. */
export function HealthScoreBlock({
  score,
  subScores,
}: {
  score: OverviewPayload["intent_health_score"];
  subScores: { label: string; score: number; detail: string; href: string }[];
}) {
  return (
    <section className="overview-block" data-block="health-score">
      <h2>Intent Health Score</h2>
      <GaugeWithSubScores score={score.score} label="Intent Health Score" note={score.note} subScores={subScores} />
    </section>
  );
}

/** Block 4 — Attribution shortcuts: three views + affiliate visit + top-3 opportunities. */
export function AttributionShortcutsBlock({
  attribution,
  match,
}: {
  attribution: AttributionPayload;
  match: MatchPayload;
}) {
  const topOpportunities = [...attribution.opportunity_scores]
    .filter((row) => row.score !== null)
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, 3);

  return (
    <section className="overview-block" data-block="attribution-shortcuts">
      <h2>归因关联快捷入口 · Attribution shortcuts</h2>
      <div className="shortcut-grid">
        <Link className="card shortcut-card" href="/plugin/attribution#intent-yield">
          <strong>Intent Yield</strong>
          <p className="muted">Orders × intents — which intents bring how many orders.</p>
          <SourceLabel kind="attribution_model" />
        </Link>
        <Link className="card shortcut-card" href="/plugin/attribution#demand-gap">
          <strong>Demand Gap</strong>
          <p className="muted">Traffic × intents — market demand estimated vs. traffic captured.</p>
          <SourceLabel kind="attribution_model" />
        </Link>
        <Link className="card shortcut-card" href="/plugin/attribution#channel-quality">
          <strong>Channel Quality</strong>
          <p className="muted">Traffic × orders — which channels carry converting intent.</p>
          <SourceLabel kind="attribution_model" />
        </Link>
        <Link className="card shortcut-card" href="/plugin/affiliate-visit">
          <strong>Intent Affiliate Visit</strong>
          <p className="muted">
            {match.affiliate_visits.length} affiliate visits in the current window.
          </p>
          <SourceLabel kind="measured" />
        </Link>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>Opportunity Score — top 3</h3>
          <span className="badge badge-estimated">estimated</span>
        </div>
        {topOpportunities.length === 0 ? (
          <EmptyWithWhy
            title="No scored opportunities yet."
            hint="Opportunity Scores rank intents by expected incremental revenue once demand and commission data exist."
            why="A score needs an estimated demand tier plus attributed orders. Intents without both are withheld (shown on the Attribution page) rather than given an invented number."
          />
        ) : (
          <ol className="opportunity-top-list">
            {topOpportunities.map((row) => (
              <li key={row.intent_id}>
                <span className="intent-id">{row.intent_id}</span> — score {row.score}{" "}
                <span className="muted">({row.formula})</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
