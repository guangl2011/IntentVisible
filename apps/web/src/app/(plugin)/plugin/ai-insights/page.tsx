"use client";

import { BlindSpotFooter } from "../components/red-lines";

/**
 * AI Insights (design v1.4 §2.4): the weekly three plain-language
 * diagnoses (roas_leak / intent_dropoff / search_gap) with actionable
 * payloads — a Phase II block; the ai_insights table fills then.
 */
export default function AiInsightsPage() {
  return (
    <>
      <h1>AI Insights</h1>
      <p className="muted">
        Three plain-language diagnoses per week — a revenue leak, an intent drop-off, or a search gap — each
        with the data window it was computed over and, in Phase II, an executable action behind it.
      </p>
      <div className="card">
        <div className="intent-head">
          <h3>This week's diagnoses</h3>
          <span className="badge badge-not-measured">Phase II — ai_insights not populated yet</span>
        </div>
        <p className="muted">
          Weekly diagnostics start once the diagnosis job runs over measured attribution data. When they
          arrive, each insight carries its generation time, data window, and — for execution-backed
          insights — the exact campaign payload the action button would apply.
        </p>
      </div>
      <BlindSpotFooter
        items={[
          "No LLM diagnostics exist yet in Phase I — this page shows the honest empty state instead of canned advice.",
          "Insight generation never fabricates measurements; every insight cites its data window and source labels.",
        ]}
      />
    </>
  );
}
