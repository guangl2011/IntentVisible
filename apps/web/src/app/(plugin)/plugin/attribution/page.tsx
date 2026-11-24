"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../../lib/plugin/load";
import { AttributionPanels } from "../components/attribution-panels";
import { BlindSpotFooter } from "../components/red-lines";
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
      <h1>Attribution — Intent Yield · Demand Gap · Channel Quality</h1>
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
      <BlindSpotFooter
        items={[
          "Web Pixel records from install day onward — there is no pre-install behavioral history.",
          "Demand estimates are estimated tiers, not measured search volumes.",
        ]}
      />
    </>
  );
}
