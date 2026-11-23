"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../components/panels";
import { getPluginClient } from "../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../lib/plugin/load";
import { PluginNav } from "./components/plugin-nav";
import { usePluginPage } from "./use-plugin-page";
import { AlertsPanel, HealthScorePanel, StoreSummaryPanel } from "./components/overview-panels";

/**
 * Overview — the plugin's default landing page (design v1.4 §2.2):
 * Today's Alert, the Agentic Store Summary with its provenance footer,
 * and the Intent Health Score labeled heuristic.
 */

function loadOverview(shopId: string) {
  return loadPlugin(() => getPluginClient().overview(shopId));
}

export default function PluginOverviewPage() {
  const loader = useCallback((shopId: string) => loadOverview(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <PluginNav active="" />
      <p className="muted">
        Your store's agentic state at a glance: what needs attention today, how AI engines see the store,
        and how healthy the intent system is. Every number carries its provenance.
      </p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label="the overview" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <>
          <AlertsPanel alerts={result.data.payload.todays_alerts} />
          <StoreSummaryPanel summary={result.data.payload.agentic_store_summary} />
          <HealthScorePanel score={result.data.payload.intent_health_score} />
        </>
      )}
    </>
  );
}
