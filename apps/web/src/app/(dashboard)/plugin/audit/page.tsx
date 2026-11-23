"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../../lib/plugin/load";
import { PluginNav } from "../components/plugin-nav";
import { AuditPanels } from "../components/audit-panels";
import { usePluginPage } from "../use-plugin-page";

/**
 * Intent Audit — readiness and performance billing (design v1.4 §2.4):
 * a heuristic readiness per intent, recommendations that reference
 * specific intent units, and the Track A / Track B billing state.
 */

function loadAudit(shopId: string) {
  return loadPlugin(() => getPluginClient().audit(shopId));
}

export default function IntentAuditPage() {
  const loader = useCallback((shopId: string) => loadAudit(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <PluginNav active="audit" />
      <p className="muted">
        Where your intent system stands and what to fix next — every recommendation names the intent unit it
        concerns, and readiness is a heuristic, never a performance guarantee.
      </p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label="the intent audit" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <AuditPanels payload={result.data.payload} />
      )}
    </>
  );
}
