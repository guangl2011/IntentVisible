"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../../lib/plugin/load";
import { BlindSpotFooter } from "../components/red-lines";
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
      <h1>Commission — orders &amp; commission</h1>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label="the commission ledger" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <CommissionPanels payload={result.data.payload} />
      )}

      <BlindSpotFooter
        items={[
          "Commission totals cover attributed orders only — orders without an attribution basis are never billed.",
          "Order dates and order totals are demo values labeled simulated; only billed commission amounts are measured.",
        ]}
      />
    </>
  );
}
