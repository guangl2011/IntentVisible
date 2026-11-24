"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { useT } from "../../../../lib/plugin/i18n/locale";
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
  const t = useT();
  const loader = useCallback((shopId: string) => loadAttribution(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <h1>{t.attribution.title}</h1>
      <p className="muted">{t.attribution.intro}</p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label={t.simLabels.loadingAttribution} />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <AttributionPanels payload={result.data.payload} />
      )}
      <BlindSpotFooter items={t.blindSpots.attribution} />
    </>
  );
}
