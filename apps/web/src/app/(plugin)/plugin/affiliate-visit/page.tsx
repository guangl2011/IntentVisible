"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { useT } from "../../../../lib/plugin/i18n/locale";
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
  const t = useT();
  const loader = useCallback((shopId: string) => loadMatch(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <h1>{t.affiliateVisit.title}</h1>
      <div className="card how-it-works">{t.affiliateVisit.howItWorks}</div>
      <p className="muted">{t.affiliateVisit.sessionsNote}</p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}

      {binding === null || result === null ? (
        <LoadingPanel label={t.simLabels.loadingAffiliateVisits} />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <>
          <AffiliateVisitsPanel payload={result.data.payload} />
          <SettlementPanel settlement={result.data.payload.settlement} />
        </>
      )}

      <BlindSpotFooter items={t.blindSpots.affiliateVisit} />
    </>
  );
}
