"use client";

import { useCallback } from "react";
import { useParams } from "next/navigation";

import { DataModeHeader } from "../../../../(dashboard)/pipeline/components/data-mode-header";
import { ErrorPanel, LoadingPanel } from "../../../../(dashboard)/components/panels";
import { getPluginClient } from "../../../../../lib/plugin/endpoint";
import { loadPlugin } from "../../../../../lib/plugin/load";
import { IntentUnitCard } from "../../components/buyer-intents-panels";
import { usePluginPage } from "../../use-plugin-page";

/**
 * Buyer Intent detail — the full anatomy of one intent unit (design
 * v1.4 §2.3 Buyer Intents): identity fields, evidence chain, prompts,
 * and the complete visibility provenance block.
 */

function loadIntent(shopId: string, intentId: string) {
  return loadPlugin(() => getPluginClient().intent(shopId, intentId));
}

export default function BuyerIntentDetailPage() {
  const params = useParams<{ intentId: string }>();
  const intentId = typeof params?.intentId === "string" ? params.intentId : "";
  const loader = useCallback((shopId: string) => loadIntent(shopId, intentId), [intentId]);
  const { binding, result } = usePluginPage(loader);

  return (
    <>
      <h1>Buyer Intent detail</h1>
      {result?.ok ? <DataModeHeader dataMode={result.data.dataMode} /> : null}
      {binding === null || result === null || intentId === "" ? (
        <LoadingPanel label="the intent" />
      ) : !result.ok ? (
        <ErrorPanel message={result.error.message} />
      ) : (
        <div className="card">
          <div className="intent-head">
            <h3>{result.data.payload.intent_name}</h3>
            <span className="muted">
              v{result.data.payload.intent_version} · {result.data.payload.intent_id}
            </span>
          </div>
          <IntentUnitCard unit={result.data.payload} />
          <div className="intent-evidence">
            <strong className="muted">Evidence chain:</strong>
            <ul>
              {result.data.payload.evidence_urls.map((url) => (
                <li key={url}>
                  <a className="evidence-link" href={url} target="_blank" rel="noreferrer">
                    {url}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <p className="muted">
            Persona: {result.data.payload.persona} · Stage: {result.data.payload.buyer_stage} · Category:{" "}
            {result.data.payload.intent_category} · Confidence: {result.data.payload.confidence}
          </p>
        </div>
      )}
    </>
  );
}
