"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../../lib/plugin/load";
import { PluginNav } from "../components/plugin-nav";
import { MatchPanels } from "../components/match-panels";
import { usePluginPage } from "../use-plugin-page";

/**
 * Intent Match — affiliate traffic and the settlement gate (design
 * v1.4 §2.5): external affiliate visits with channel/partner splits,
 * settlement computed only over provider_measured data.
 */

function loadMatch(shopId: string) {
  return loadPlugin(() => getPluginClient().match(shopId));
}

export default function IntentMatchPage() {
  const loader = useCallback((shopId: string) => loadMatch(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <PluginNav active="match" />
      <p className="muted">
        Where matching sends traffic and what it earns: affiliate visits from Play and Ads channels and
        partner placements, joined to orders and commission through one tracking-code system.
      </p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label="intent matching" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <MatchPanels payload={result.data.payload} />
      )}
    </>
  );
}
