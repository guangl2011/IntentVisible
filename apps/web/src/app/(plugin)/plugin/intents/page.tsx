"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { loadPlugin } from "../../../../lib/plugin/load";
import { IntentGroupTable } from "../components/buyer-intents-panels";
import { BlindSpotFooter } from "../components/red-lines";
import { usePluginPage } from "../use-plugin-page";

/**
 * Buyer Intents — the intent library read surface (design v1.4 §2.3):
 * intent units grouped by persona × buyer stage, prompt cards carrying
 * full visibility provenance, and an explicit not-measured state.
 */

function loadIntents(shopId: string) {
  return loadPlugin(() => getPluginClient().intents(shopId));
}

export default function BuyerIntentsPage() {
  const t = useT();
  const loader = useCallback((shopId: string) => loadIntents(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <h1>{t.buyerIntents.title}</h1>
      <p className="muted">{t.buyerIntents.intro}</p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label={t.simLabels.loadingIntents} />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <IntentGroupTable units={result.data.payload} />
      )}

      <BlindSpotFooter items={t.blindSpots.intents} />
    </>
  );
}
