"use client";

import { useCallback } from "react";

import { DataModeHeader } from "../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../lib/plugin/endpoint";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { loadPlugin } from "../../../../lib/plugin/load";
import { AuditPanels } from "../components/audit-panels";
import { BlindSpotFooter } from "../components/red-lines";
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
  const t = useT();
  const loader = useCallback((shopId: string) => loadAudit(shopId), []);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <h1>{t.audit.title}</h1>
      <p className="muted">{t.audit.intro}</p>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null ? (
        <LoadingPanel label={t.simLabels.loadingAudit} />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <AuditPanels payload={result.data.payload} />
      )}
      <BlindSpotFooter items={t.blindSpots.audit} />
    </>
  );
}
