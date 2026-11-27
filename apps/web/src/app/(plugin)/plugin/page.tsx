"use client";

import { useCallback } from "react";

import type {
  AuditPayload,
  MatchPayload,
  OverviewPayload,
} from "../../../lib/plugin/types";
import { DataModeChip, PluginError, PluginLoading } from "./components/status";
import { getPluginClient } from "../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../lib/plugin/load";
import {
  IntentMapBlock,
  IntentPerformanceBlock,
  StoreSummaryBlock,
  TodaysAlertBlock,
  averageReadiness,
  healthSubScores,
  intentDropOffWarning,
} from "./components/overview-panels";
import { BlindSpotFooter } from "./components/red-lines";
import { useT } from "../../../lib/plugin/i18n/locale";
import { usePluginPage } from "./use-plugin-page";

/**
 * Overview — the plugin's default landing page (design v1.5 §0.6 rule 1,
 * §2.2): sections top-down, each with an icon — Today's Alert, Agentic
 * Store Summary, Intent Map (gauge + monitored pages), and Intent
 * Performance (traffic / AI insights / affiliate orders). Three read
 * routes feed it in parallel; each block renders its own loading/error
 * state so one failing route never blanks the page.
 */

function loadOverview(shopId: string) {
  return loadPlugin(() => getPluginClient().overview(shopId));
}
function loadMatch(shopId: string) {
  return loadPlugin(() => getPluginClient().match(shopId));
}
function loadAudit(shopId: string) {
  return loadPlugin(() => getPluginClient().audit(shopId));
}

export default function PluginOverviewPage() {
  const t = useT();

  const overviewLoader = useCallback((shopId: string) => loadOverview(shopId), []);
  const matchLoader = useCallback((shopId: string) => loadMatch(shopId), []);
  const auditLoader = useCallback((shopId: string) => loadAudit(shopId), []);

  const overview = usePluginPage(overviewLoader);
  const match = usePluginPage(matchLoader);
  const audit = usePluginPage(auditLoader);

  // Narrowed payload/error views — each route is pending (null), failed
  // (error message), or loaded (payload). Blocks key off their own trio.
  const overviewPayload: OverviewPayload | null = overview.result?.ok ? overview.result.data.payload : null;
  const overviewError: string | null =
    overview.result && !overview.result.ok ? overview.result.error.message : null;
  const overviewPending = overview.result === null || overview.binding === null;

  const matchPayload: MatchPayload | null = match.result?.ok ? match.result.data.payload : null;
  const auditPayload: AuditPayload | null = audit.result?.ok ? audit.result.data.payload : null;
  const auditError: string | null = audit.result && !audit.result.ok ? audit.result.error.message : null;
  const auditPending = audit.result === null || audit.binding === null;

  const dataMode = overview.result?.ok ? overview.result.data.dataMode : undefined;
  const dropOff = matchPayload ? intentDropOffWarning(matchPayload) : null;
  const avgReadiness = auditPayload ? averageReadiness(auditPayload.readiness.per_intent) : null;

  const attributedOrders =
    matchPayload?.affiliate_visits.filter((visit) => visit.order_id !== null).length ?? 0;

  return (
    <>
      <h1>{t.overview.title}</h1>
      <p className="muted">{t.overview.subtitle}</p>
      {dataMode !== undefined ? <DataModeChip dataMode={dataMode} /> : null}

      {/* Block 1 — Today's Alert (calm / alert states, rule-triggered). */}
      {overviewPending ? (
        <section className="overview-block" data-block="todays-alert">
          <PluginLoading what={t.overview.alert.title} />
        </section>
      ) : overviewError !== null ? (
        <section className="overview-block" data-block="todays-alert">
          <PluginError message={overviewError} />
        </section>
      ) : (
        <TodaysAlertBlock alerts={overviewPayload?.todays_alerts ?? []} dropOff={dropOff} />
      )}

      {/* Block 2 — Agentic Store Summary. */}
      {overviewPending ? (
        <section className="overview-block" data-block="agentic-summary">
          <PluginLoading what={t.overview.summary.title} />
        </section>
      ) : overviewError !== null ? (
        <section className="overview-block" data-block="agentic-summary">
          <PluginError message={overviewError} />
        </section>
      ) : overviewPayload === null ? null : (
        <StoreSummaryBlock summary={overviewPayload.agentic_store_summary} />
      )}

      {/* Block 3 — Intent Map: health gauge (col 1) + Landing Pages Monitored (col 2). */}
      {overviewPending || auditPending ? (
        <section className="overview-block" data-block="intent-map">
          <PluginLoading what={t.overview.intentMap.title} />
        </section>
      ) : overviewError !== null ? (
        <section className="overview-block" data-block="intent-map">
          <PluginError message={overviewError} />
        </section>
      ) : auditError !== null ? (
        <section className="overview-block" data-block="intent-map">
          <PluginError message={auditError} />
        </section>
      ) : overviewPayload === null ? null : (
        <IntentMapBlock
          score={overviewPayload.intent_health_score}
          subScores={healthSubScores(overviewPayload, avgReadiness ?? 0)}
          readinessMeasured={avgReadiness !== null}
        />
      )}

      {/* Block 4 — Intent Performance: traffic / AI insights / affiliate orders. */}
      {match.result === null || match.binding === null ? (
        <section className="overview-block" data-block="intent-performance">
          <PluginLoading what={t.overview.performance.title} />
        </section>
      ) : (
        <IntentPerformanceBlock data={{ attributedOrders }} />
      )}

      <BlindSpotFooter items={t.blindSpots.overview} />
    </>
  );
}
