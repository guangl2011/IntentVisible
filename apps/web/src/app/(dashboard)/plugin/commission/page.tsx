"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../../lib/plugin/load";
import { PluginNav } from "../components/plugin-nav";
import { CommissionPanels } from "../components/commission-panels";
import { usePluginPage } from "../use-plugin-page";

/**
 * Commission — the per-order billing page (design v1.4 §2.5, Track A):
 * gross → refund offsets → net per order, reconciled against Shopify.
 */

function loadCommission(shopId: string) {
  return loadPlugin(() => getPluginClient().commission(shopId));
}

export default function CommissionPage() {
  const loader = useCallback((shopId: string) => loadCommission(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <PluginNav active="commission" />
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label="the commission ledger" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <CommissionPanels payload={result.data.payload} />
      )}
    </>
  );
}
