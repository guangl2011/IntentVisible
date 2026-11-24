"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
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
  const loader = useCallback((shopId: string) => loadIntents(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <h1>Buyer Intents</h1>
      <p className="muted">
        Your buyer intents as AI engines see them: who is asking (persona), where they are in the journey
        (stage), what they are trying to solve (pain point), and how visible each intent currently is —
        with the engine set and measurement window on every measured number.
      </p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label="buyer intents" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <IntentGroupTable units={result.data.payload} />
      )}

      <BlindSpotFooter
        items={[
          "Visibility is measured only for intents with active monitoring — a unit shows not_measured until its monitoring runs.",
          "Search volumes are never invented; demand appears as an estimated tier only on the Attribution page.",
        ]}
      />
    </>
  );
}
