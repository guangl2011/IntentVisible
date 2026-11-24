"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../(dashboard)/components/panels";
import { getPluginClient } from "../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../lib/plugin/load";
import {
  AttributionShortcutsBlock,
  HealthScoreBlock,
  StoreSummaryBlock,
  TodaysAlertBlock,
  averageReadiness,
  healthSubScores,
  intentDropOffWarning,
} from "./components/overview-panels";
import { BlindSpotFooter } from "./components/red-lines";
import { usePluginPage } from "./use-plugin-page";

/**
 * Overview — the plugin's default landing page (design v1.4 §2.2):
 * exactly four blocks in order — Today's Alert, Agentic Store Summary,
 * Intent Health Score, attribution shortcuts. Four read routes feed it
 * in parallel; each block renders its own loading/error state so one
 * failing route never blanks the page.
 */

function loadOverview(shopId: string) {
  return loadPlugin(() => getPluginClient().overview(shopId));
}
function loadAttribution(shopId: string) {
  return loadPlugin(() => getPluginClient().attribution(shopId));
}
function loadMatch(shopId: string) {
  return loadPlugin(() => getPluginClient().match(shopId));
}
function loadAudit(shopId: string) {
  return loadPlugin(() => getPluginClient().audit(shopId));
}

export default function PluginOverviewPage() {
  const overviewLoader = useCallback((shopId: string) => loadOverview(shopId), []);
  const attributionLoader = useCallback((shopId: string) => loadAttribution(shopId), []);
  const matchLoader = useCallback((shopId: string) => loadMatch(shopId), []);
  const auditLoader = useCallback((shopId: string) => loadAudit(shopId), []);

  const overview = usePluginPage(overviewLoader);
  const attribution = usePluginPage(attributionLoader);
  const match = usePluginPage(matchLoader);
  const audit = usePluginPage(auditLoader);

  const dataMode = overview.result?.ok ? overview.result.data.dataMode : undefined;

  return (
    <>
      <h1>Overview</h1>
      <p className="muted">
        Your store's agentic state at a glance: what needs attention today, how AI engines see the store,
        and how healthy the intent system is. Every number carries its provenance.
      </p>
      {dataMode !== undefined ? <DataModeHeader dataMode={dataMode} /> : null}

      {/* Block 1 — Today's Alert (rule-triggered, priority-sorted). */}
      {overview.binding === null || overview.result === null ? (
        <section className="overview-block" data-block="todays-alert">
          <h2>Today's Alert</h2>
          <LoadingPanel label="today's alerts" />
        </section>
      ) : !overview.result.ok ? (
        <section className="overview-block" data-block="todays-alert">
          <h2>Today's Alert</h2>
          <ErrorPanel message={overview.result.error.message} />
        </section>
      ) : (
        <TodaysAlertBlock
          alerts={overview.result.data.payload.todays_alerts}
          dropOff={match.result?.ok ? intentDropOffWarning(match.result.data.payload) : null}
        />
      )}

      {/* Block 2 — Agentic Store Summary. */}
      {overview.binding === null || overview.result === null ? (
        <section className="overview-block" data-block="agentic-summary">
          <h2>Agentic Store Summary</h2>
          <LoadingPanel label="the store summary" />
        </section>
      ) : !overview.result.ok ? (
        <section className="overview-block" data-block="agentic-summary">
          <h2>Agentic Store Summary</h2>
          <ErrorPanel message={overview.result.error.message} />
        </section>
      ) : (
        <StoreSummaryBlock summary={overview.result.data.payload.agentic_store_summary} />
      )}

      {/* Block 3 — Intent Health Score (gauge + expandable sub-scores). */}
      {overview.result?.ok && audit.result?.ok ? (
        <HealthScoreBlock
          score={overview.result.data.payload.intent_health_score}
          subScores={healthSubScores(
            overview.result.data.payload,
            averageReadiness(audit.result.data.payload.readiness.per_intent),
          )}
        />
      ) : !overview.result?.ok && overview.result !== null && overview.binding !== null ? (
        <section className="overview-block" data-block="health-score">
          <h2>Intent Health Score</h2>
          <ErrorPanel message={overview.result.error.message} />
        </section>
      ) : !audit.result?.ok && audit.result !== null && audit.binding !== null ? (
        <section className="overview-block" data-block="health-score">
          <h2>Intent Health Score</h2>
          <ErrorPanel message={audit.result.error.message} />
        </section>
      ) : (
        <section className="overview-block" data-block="health-score">
          <h2>Intent Health Score</h2>
          <LoadingPanel label="the health score" />
        </section>
      )}

      {/* Block 4 — Attribution shortcut cards + top-3 Opportunity Scores. */}
      {attribution.result?.ok && match.result?.ok ? (
        <AttributionShortcutsBlock
          attribution={attribution.result.data.payload}
          match={match.result.data.payload}
        />
      ) : !attribution.result?.ok && attribution.result !== null && attribution.binding !== null ? (
        <section className="overview-block" data-block="attribution-shortcuts">
          <h2>归因关联快捷入口 · Attribution shortcuts</h2>
          <ErrorPanel message={attribution.result.error.message} />
        </section>
      ) : !match.result?.ok && match.result !== null && match.binding !== null ? (
        <section className="overview-block" data-block="attribution-shortcuts">
          <h2>归因关联快捷入口 · Attribution shortcuts</h2>
          <ErrorPanel message={match.result.error.message} />
        </section>
      ) : (
        <section className="overview-block" data-block="attribution-shortcuts">
          <h2>归因关联快捷入口 · Attribution shortcuts</h2>
          <LoadingPanel label="the attribution shortcuts" />
        </section>
      )}

      <BlindSpotFooter
        items={[
          "Web Pixel events are recorded from the install date onward — there is no pre-install behavior history.",
          "Dark-social / word-of-mouth traffic without UTM or click IDs, and organic search keywords, are invisible in Phase I.",
          "Ad spend is a Phase II connection — ROAS figures wait until the merchant authorizes ad accounts.",
        ]}
      />
    </>
  );
}
