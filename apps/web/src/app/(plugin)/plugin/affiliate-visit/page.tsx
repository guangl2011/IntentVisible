"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../../lib/plugin/load";
import { AffiliateVisitsPanel, SettlementPanel } from "../components/match-visit-panels";
import { BlindSpotFooter } from "../components/red-lines";
import { usePluginPage } from "../use-plugin-page";

/**
 * Intent Affiliate Visit (design v1.4 §2.5): the external affiliate
 * traffic Intent Match brings in — split by channel / partner / intent,
 * landing performance, and the per-visit order linkage that feeds the
 * Commission page through the same tracking-code system.
 */

function loadMatch(shopId: string) {
  return loadPlugin(() => getPluginClient().match(shopId));
}

export default function AffiliateVisitPage() {
  const loader = useCallback((shopId: string) => loadMatch(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <h1>Intent Affiliate Visit</h1>
      <div className="card how-it-works">
        How it works: Intent Match channels and partners send external traffic to your intent pages. This
        page shows how many visits arrived, where they came from, which intent pages they landed on, and how
        each visit joins to an order — the same tracking-code system the Commission page bills on.
      </div>
      <p className="muted">
        Sessions come from affiliate-side tracking joined with UTM / click-id / referrer parameters.
      </p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}

      {binding === null || result === null ? (
        <LoadingPanel label="affiliate visits" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <>
          <AffiliateVisitsPanel payload={result.data.payload} />
          <SettlementPanel settlement={result.data.payload.settlement} />
        </>
      )}

      <BlindSpotFooter
        items={[
          "Affiliate visits are recorded from partner-side tracking — dark-social traffic without tracking parameters is invisible.",
          "Crawler-level coverage is a Phase II concern; Phase I counts source sessions only.",
        ]}
      />
    </>
  );
}
