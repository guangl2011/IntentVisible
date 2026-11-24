"use client";

import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter } from "../components/red-lines";

/**
 * AI Insights (design v1.4 §2.4): the weekly three plain-language
 * diagnoses (roas_leak / intent_dropoff / search_gap) with actionable
 * payloads — a Phase II block; the ai_insights table fills then.
 */
export default function AiInsightsPage() {
  const t = useT();
  return (
    <>
      <h1>{t.aiInsights.title}</h1>
      <p className="muted">{t.aiInsights.intro}</p>
      <div className="card">
        <div className="intent-head">
          <h3>{t.aiInsights.weekly.title}</h3>
          <span className="badge badge-not-measured">{t.aiInsights.weekly.badge}</span>
        </div>
        <p className="muted">{t.aiInsights.weekly.body}</p>
      </div>
      <BlindSpotFooter items={t.blindSpots.aiInsights} />
    </>
  );
}
