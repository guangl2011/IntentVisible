import type { BuyerIntentLib } from "@intentvisible/client";

import { EmptyPanel } from "../../components/panels";
import { DataModeHeader } from "./data-mode-header";

/**
 * Gate 3's pre-publish render: the Buyer Intent Lib exactly as the Export
 * Spec v2 renderer builds it — Data Mode header up front, intents sorted by
 * demand tier then best visibility, prompts split into revenue (≥50%) and
 * market (30–49%) expansion. The record a customer would publish is the
 * record shown here.
 */

function PromptLine({ prompt }: { prompt: BuyerIntentLib["intents"][number]["revenueExpansion"][number] }) {
  return (
    <li>
      “{prompt.text}” <span className="badge badge-PENDING_APPROVAL">{prompt.visibilityPct.toFixed(0)}%</span>
      <span className="muted prompt-meta">
        {prompt.buyerStage} · {prompt.intentCategory}
        {prompt.platforms.length > 0 ? ` · ${prompt.platforms.join(", ")}` : ""}
      </span>
    </li>
  );
}

function IntentBlock({ intent }: { intent: BuyerIntentLib["intents"][number] }) {
  return (
    <article className="card intent-card">
      <div className="intent-head">
        <h3>{intent.intentName}</h3>
        <span className="badge badge-DECLARED">{intent.monthlySearchVolume.tier} demand</span>
      </div>
      <p className="muted intent-summary">
        {intent.buyerStage} · {intent.intentCategory}
        {intent.monthlySearchVolume.monthlyVolume !== null
          ? ` · ${intent.monthlySearchVolume.monthlyVolume} measured monthly searches`
          : " · demand shown as tier (not measured)"}
      </p>
      <h4>Revenue expansion (visibility ≥ 50%)</h4>
      {intent.revenueExpansion.length === 0 ? (
        <p className="muted">No prompts above the 50% line yet.</p>
      ) : (
        <ul className="graph-list">
          {intent.revenueExpansion.map((prompt) => (
            <PromptLine key={prompt.promptId} prompt={prompt} />
          ))}
        </ul>
      )}
      <h4>Market expansion (visibility 30–49%)</h4>
      {intent.marketExpansion.length === 0 ? (
        <p className="muted">No prompts in the 30–49% band.</p>
      ) : (
        <ul className="graph-list">
          {intent.marketExpansion.map((prompt) => (
            <PromptLine key={prompt.promptId} prompt={prompt} />
          ))}
        </ul>
      )}
    </article>
  );
}

export function LibPreviewPanel({ lib }: { lib: BuyerIntentLib | null }) {
  if (lib === null) {
    return (
      <EmptyPanel
        title="No lib preview yet"
        hint="The pre-publish lib renders once the monitoring plan exists — it is built from stored prompts and metrics only."
      />
    );
  }
  return (
    <div className="lib-preview">
      <div className="card">
        <h2 className="page-title">{lib.exportSpec}</h2>
        <DataModeHeader dataMode={lib.dataMode} />
        <p className="muted">
          {lib.competitors.map((competitor) => competitor.name).join(", ")} ·{" "}
          {lib.intents.length} intents · {lib.excluded.belowVisibilityFloor} below the 30% visibility
          floor · {lib.excluded.noisyBaseline} held back as noisy
        </p>
      </div>
      {lib.intents.map((intent) => (
        <IntentBlock key={intent.intentId} intent={intent} />
      ))}
    </div>
  );
}
