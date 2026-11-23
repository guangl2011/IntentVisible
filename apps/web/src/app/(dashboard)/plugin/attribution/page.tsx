"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../../lib/plugin/load";
import { PluginNav } from "../components/plugin-nav";
import { AttributionPanels } from "../components/attribution-panels";
import { usePluginPage } from "../use-plugin-page";

/**
 * Attribution — the intent correlation model (design v1.4 §1.8): Intent
 * Yield, Demand Gap buckets, Channel Quality, the D→T→O funnel, and
 * Opportunity Scores that are always labeled estimated.
 */

function loadAttribution(shopId: string) {
  return loadPlugin(() => getPluginClient().attribution(shopId));
}

export default function AttributionPage() {
  const loader = useCallback((shopId: string) => loadAttribution(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <PluginNav active="attribution" />
      <p className="muted">
        How intents connect to traffic and orders — without rebuilding the single-metric analytics your
        existing tools already cover. Measured anchors come from the Shopify order ledger; demand is an
        estimate and is labeled as one.
      </p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label="the attribution model" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <AttributionPanels payload={result.data.payload} />
      )}
    </>
  );
}
