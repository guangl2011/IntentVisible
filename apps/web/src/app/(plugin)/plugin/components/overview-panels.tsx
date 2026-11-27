"use client";

import Link from "next/link";

import type { MatchPayload, OverviewPayload, PluginAlert } from "../../../../lib/plugin/types";
import {
  AI_PLATFORMS,
  AI_PLATFORM_DISTRIBUTION_FIXTURE,
  AI_TRAFFIC_TREND_BY_PLATFORM,
  AI_VISITS_BY_TYPE_FIXTURE,
  INTENT_TREND_FIXTURE,
  MONITORED_LANDING_PAGES_FIXTURE,
  totalAiVisits,
} from "../../../../lib/plugin/demo-fixtures";
import type { AiTrafficTrend } from "../../../../lib/plugin/demo-fixtures";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { SeverityBadge, usd } from "./badges";
import { SimulatedLabel, SourceLabel } from "./red-lines";
import { GaugeWithSubScores, ScoreRing } from "./visual-patterns";
import type { GaugeSubScore, HealthSubKey } from "./visual-patterns";
import { DonutChart, MiniTrendLine, PlatformCloud } from "./primitives";
import { IconAlert, IconAudit, IconGauge, IconLibrary, IconMatch, IconStore, IconTraffic } from "./icons";

/**
 * Overview page blocks (design v1.5 §0.6 rule 1, §2.2): sections render
 * top-down — Today's Alert, Agentic Store Summary, Intent Map (health
 * gauge + monitored pages), the three parallel module cards, and Intent
 * Performance. Every string comes from the dictionary in the active
 * locale; every number carries its provenance.
 */

/** Pure helper: the Intent Drop-off rule — affiliate traffic is arriving but orders are not. */
export function intentDropOffWarning(
  payload: MatchPayload,
): { sessions: number; orders: number } | null {
  const visits = payload.affiliate_visits.length;
  const orders = payload.affiliate_visits.filter((visit) => visit.order_id !== null).length;
  if (visits === 0 || orders > 0) return null;
  return { sessions: visits, orders };
}

/** Pure helper: localized alert body for an alert's reason kind. */
export function alertBody(
  alert: PluginAlert,
  t: ReturnType<typeof useT>,
): string {
  const kind = alert.reason_kind;
  switch (kind) {
    case "first_intent_attributed_order":
      return t.overview.alert.reasonBody.first_intent_attributed_order(alert.order_id ?? "—");
    case "refund_offset_recorded":
      return t.overview.alert.reasonBody.refund_offset_recorded(alert.order_id ?? "—");
    case "intent_pending_review":
    case "single_day_snapshot":
    case "visibility_not_measured":
      return t.overview.alert.reasonBody[kind](alert.intent_id ?? "—");
  }
}

/** Block 1 — Today's Alert: calm "all clear" state, explicit alert state (drop-off / rules). */
export function TodaysAlertBlock({
  alerts,
  dropOff,
}: {
  alerts: PluginAlert[];
  dropOff: { sessions: number; orders: number } | null;
}) {
  const t = useT();
  const inAlertState = alerts.length > 0 || dropOff !== null;

  return (
    <section className="overview-block" data-block="todays-alert">
      <div className="iv-section-heading">
        <span className="iv-section-icon" aria-hidden="true"><IconAlert /></span>
        <h2>{t.overview.alert.title}</h2>
        {inAlertState ? <SourceLabel kind="measured" /> : null}
      </div>

      {!inAlertState ? (
        <div className="iv-card iv-alert-card is-calm" data-testid="alert-calm">
          <strong>{t.overview.alert.calmTitle}</strong>
          <p>{t.overview.alert.calmBody}</p>
        </div>
      ) : (
        <div className="alert-list">
          {dropOff !== null ? (
            <div className="iv-card iv-alert-card is-alert" data-testid="intent-dropoff-warning">
              <div className="intent-head">
                <strong>
                  <SeverityBadge severity="p1" /> {t.overview.alert.dropOffTitle}
                </strong>
                <SourceLabel kind="measured" />
              </div>
              <p>{t.overview.alert.dropOffBody(dropOff.sessions, dropOff.orders)}</p>
              <Link className="btn" href="/plugin/attribution#channel-quality">
                {t.overview.alert.dropOffCta}
              </Link>
            </div>
          ) : null}
          {alerts.map((alert) => (
            <div key={alert.alert_id} className="iv-card iv-alert-card is-alert">
              <div className="intent-head">
                <strong>
                  <SeverityBadge severity={alert.severity} /> {t.overview.alert.reasonKind[alert.reason_kind]}
                </strong>
                {alert.reason_kind === "first_intent_attributed_order" ? (
                  <span className="badge badge-milestone">{t.overview.alert.milestoneBadge}</span>
                ) : null}
              </div>
              <p>{alertBody(alert, t)}</p>
              {alert.reason_kind === "intent_pending_review" ? (
                <p className="countdown" data-testid="auto-approve-countdown">
                  {t.overview.alert.countdown(alert.intent_id ?? "intent")}
                </p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Block 2 — Agentic Store Summary: hero card + platform cloud + donut + CTA. */
export function StoreSummaryBlock({ summary }: { summary: OverviewPayload["agentic_store_summary"] }) {
  const t = useT();
  return (
    <section className="overview-block" data-block="agentic-summary">
      <div className="iv-section-heading">
        <span className="iv-section-icon" aria-hidden="true"><IconStore /></span>
        <h2>{t.overview.summary.title}</h2>
      </div>
      <div className="iv-card iv-hero-card">
        <div className="iv-hero-main">
          <p className="iv-hero-statement">
            {t.overview.summary.summary(
              summary.key_numbers.active_intent_count,
              summary.key_numbers.persona_count,
              summary.key_numbers.ai_referral_sessions_7d,
            )}
          </p>
          <div className="iv-stat-grid">
            <div className="iv-stat">
              <span className="iv-stat-value">{summary.key_numbers.persona_count}</span>
              <span className="muted">{t.overview.summary.statPersonas}</span> <SourceLabel kind="measured" />
            </div>
            <div className="iv-stat">
              <span className="iv-stat-value">{summary.key_numbers.active_intent_count}</span>
              <span className="muted">{t.overview.summary.statIntents}</span> <SourceLabel kind="measured" />
            </div>
            <div className="iv-stat">
              <span className="iv-stat-value">{summary.key_numbers.ai_referral_sessions_7d}</span>
              <span className="muted">{t.overview.summary.statSessions}</span> <SourceLabel kind="measured" />
            </div>
            <div className="iv-stat">
              <span className="iv-stat-value iv-stat-live">{t.overview.summary.liveStatus}</span>
              <span className="muted">{t.overview.summary.statLlms}</span> <SimulatedLabel what="llms.txt" />
            </div>
          </div>
          <p className="muted provenance-footer">
            {t.overview.summary.provenance(
              summary.provenance.generated_by,
              summary.provenance.data_window_start,
              summary.provenance.data_window_end,
            )}
          </p>
        </div>
        <div className="iv-hero-side">
          <p className="iv-hero-side-title">{t.overview.summary.platformCloudTitle}</p>
          <PlatformCloud platforms={AI_PLATFORMS} />
          <DonutChart slices={AI_PLATFORM_DISTRIBUTION_FIXTURE} title={t.common.simulatedTitle(t.simLabels.platformDistribution)} />
          <SimulatedLabel what={t.simLabels.platformDistribution} />
          <Link className="btn iv-hero-cta" href="/plugin/attribution">
            {t.overview.summary.cta}
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Pure helper: the three §2.2 sub-scores from the overview + audit payloads. */
export function healthSubScores(
  overview: OverviewPayload,
  pageReadiness: number | null,
): GaugeSubScore[] {
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

  const scores: { key: HealthSubKey; score: number; href: string }[] = [
    { key: "coverage", score: coverage?.score ?? 0, href: "/plugin/intents" },
    { key: "readiness", score: pageReadiness ?? 0, href: "/plugin/audit" },
    { key: "dataHealth", score: dataHealth ?? 0, href: "/plugin/attribution" },
  ];
  return scores;
}

/** Pure helper: mean of a readiness score list, or null when nothing is scored. */
export function averageReadiness(
  perIntent: { score: number }[],
): number | null {
  if (perIntent.length === 0) return null;
  return Math.round(perIntent.reduce((sum, row) => sum + row.score, 0) / perIntent.length);
}

/** Block 3 — Intent Map: the health gauge (col 1) + Landing Pages Monitored (col 2). */
export function LandingPagesMonitoredCard() {
  const t = useT();
  const total = MONITORED_LANDING_PAGES_FIXTURE.reduce((sum, row) => sum + row.count, 0);
  return (
    <div className="iv-card" data-testid="landing-pages-monitored">
      <div className="intent-head">
        <h3>{t.overview.intentMap.landingPagesTitle}</h3>
        <SimulatedLabel what={t.simLabels.monitoredPages} />
      </div>
      <p className="iv-module-metric">
        {t.overview.intentMap.landingPagesTotal(total)}
      </p>
      <p className="muted">{t.overview.intentMap.landingPagesNote}</p>
      <ul className="iv-monitored-rows">
        {MONITORED_LANDING_PAGES_FIXTURE.map((row) => (
          <li key={row.pageType}>
            <span>{t.overview.intentMap.pageTypes[row.pageType]}</span>
            <strong>{row.count}</strong>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Block 3 — Intent Map: 2-column grid — gauge card + monitored-pages card. */
export function IntentMapBlock({
  score,
  subScores,
  readinessMeasured,
}: {
  score: OverviewPayload["intent_health_score"];
  subScores: GaugeSubScore[];
  readinessMeasured: boolean;
}) {
  const t = useT();
  return (
    <section className="overview-block" data-block="intent-map">
      <div className="iv-section-heading">
        <span className="iv-section-icon" aria-hidden="true"><IconGauge /></span>
        <h2>{t.overview.intentMap.title}</h2>
      </div>
      <div className="iv-intent-map-grid">
        <GaugeWithSubScores
          score={score.score}
          subScores={subScores}
          readinessMeasured={readinessMeasured}
        />
        <LandingPagesMonitoredCard />
      </div>
    </section>
  );
}

interface ModuleCardData {
  activeIntentCount: number;
  avgReadiness: number | null;
  attributedOrders: number;
  billedNet: number;
}

/** Block 4 — three parallel module cards (icon + metric + mini chart + description + link). */
export function ModuleCardsBlock({ data }: { data: ModuleCardData }) {
  const t = useT();
  return (
    <section className="overview-block" data-block="module-cards">
      <div className="iv-section-heading">
        <span className="iv-section-icon" aria-hidden="true"><IconLibrary /></span>
        <h2>{t.overview.modules.title}</h2>
      </div>
      <div className="iv-module-grid">
        <div className="iv-card iv-module-card">
          <div className="intent-head">
            <span className="iv-module-icon iv-module-library" aria-hidden="true"><IconLibrary /></span>
            <h3>{t.nav.library}</h3>
          </div>
          <p className="iv-module-metric">
            {data.activeIntentCount} <span className="muted">{t.overview.modules.library.metricLabel}</span>
          </p>
          <MiniTrendLine points={INTENT_TREND_FIXTURE} title={t.common.simulatedTitle(t.overview.modules.library.trendLabel)} />
          <p className="muted">{t.overview.modules.library.trendLabel} <SimulatedLabel what={t.simLabels.trend} /></p>
          <p className="iv-module-desc">{t.overview.modules.library.desc}</p>
          <Link className="btn" href="/plugin/library">{t.overview.modules.library.open}</Link>
        </div>

        <div className="iv-card iv-module-card">
          <div className="intent-head">
            <span className="iv-module-icon iv-module-audit" aria-hidden="true"><IconAudit /></span>
            <h3>{t.nav.audit}</h3>
          </div>
          {data.avgReadiness === null ? (
            <p className="iv-module-metric muted">{t.overview.health.readinessMissing}</p>
          ) : (
            <div className="iv-module-ring">
              <ScoreRing score={data.avgReadiness} label={t.overview.modules.audit.metricLabel} />
              <span className="muted">{t.overview.modules.audit.metricLabel}</span>
            </div>
          )}
          <p className="iv-module-desc">{t.overview.modules.audit.desc}</p>
          <Link className="btn" href="/plugin/audit">{t.overview.modules.audit.open}</Link>
        </div>

        <div className="iv-card iv-module-card">
          <div className="intent-head">
            <span className="iv-module-icon iv-module-match" aria-hidden="true"><IconMatch /></span>
            <h3>{t.nav.match}</h3>
          </div>
          <p className="iv-module-metric">
            {t.overview.modules.match.metric(data.attributedOrders, usd(data.billedNet))}
          </p>
          <p className="muted">{t.overview.summary.statSessions} <SourceLabel kind="measured" /></p>
          <p className="iv-module-desc">{t.overview.modules.match.desc}</p>
          <Link className="btn" href="/plugin/match">{t.overview.modules.match.open}</Link>
        </div>
      </div>
    </section>
  );
}

/** Pure helper: per-day AI-visit totals for the Intent Performance spark. */
export function aiVisitTrendTotals(trend: AiTrafficTrend[]): number[] {
  return trend.map((row) => Object.values(row.series).reduce((sum, value) => sum + value, 0));
}

interface PerformanceData {
  attributedOrders: number;
}

/** Block 4 — Intent Performance: traffic / AI insights / affiliate orders, 3 columns. */
export function IntentPerformanceBlock({ data }: { data: PerformanceData }) {
  const t = useT();
  const visits = totalAiVisits(AI_VISITS_BY_TYPE_FIXTURE);
  return (
    <section className="overview-block" data-block="intent-performance">
      <div className="iv-section-heading">
        <span className="iv-section-icon" aria-hidden="true"><IconTraffic /></span>
        <h2>{t.overview.performance.title}</h2>
      </div>
      <div className="iv-performance-grid">
        <div className="iv-card iv-module-card" data-testid="performance-traffic">
          <div className="intent-head">
            <h3>{t.overview.performance.trafficTitle}</h3>
            <SimulatedLabel what={t.simLabels.visitsByType} />
          </div>
          <p className="iv-module-metric">{t.overview.performance.trafficMetric(visits)}</p>
          <p className="muted">{t.overview.performance.trafficWindow}</p>
          <MiniTrendLine points={aiVisitTrendTotals(AI_TRAFFIC_TREND_BY_PLATFORM)} title={t.common.simulatedTitle(t.simLabels.visitTrend)} />
          <Link className="btn" href="/plugin/ai-traffic">{t.overview.performance.trafficOpen}</Link>
        </div>
        <div className="iv-card iv-module-card" data-testid="performance-insights">
          <div className="intent-head">
            <h3>{t.overview.performance.insightsTitle}</h3>
          </div>
          <p className="muted">{t.overview.performance.insightsTrackLabel}</p>
          <p className="iv-module-metric muted">{t.overview.performance.insightsEmpty}</p>
          <p className="iv-module-desc">{t.overview.performance.insightsEmptyHint}</p>
        </div>
        <div className="iv-card iv-module-card" data-testid="performance-affiliate">
          <div className="intent-head">
            <h3>{t.overview.performance.affiliateTitle}</h3>
            <SourceLabel kind="measured" />
          </div>
          <p className="muted">{t.overview.performance.affiliateTrackLabel}</p>
          <p className="iv-module-metric">{t.overview.performance.affiliateMetric(data.attributedOrders)}</p>
          <Link className="btn" href="/plugin/commission">{t.overview.performance.affiliateOpen}</Link>
        </div>
      </div>
    </section>
  );
}
