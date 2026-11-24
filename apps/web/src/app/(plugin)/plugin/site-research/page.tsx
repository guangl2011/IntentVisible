"use client";

import { SITE_RESEARCH_STEPS } from "../../../../lib/plugin/demo-fixtures";
import { BlindSpotFooter, SimulatedLabel } from "../components/red-lines";
import { TerminalPipeline } from "../components/visual-patterns";

/**
 * Site Research (design v1.4 §2.3, §2.9 pattern 1): the terminal-style
 * step pipeline — scan → source verification → map derivation — with
 * the source list and the monthly/weekly cadence switch (a Phase I
 * display until the cadence writer ships).
 */
export default function SiteResearchPage() {
  return (
    <>
      <h1>Site Research</h1>
      <p className="muted">
        How the plugin studies your public store before any intent is written: an evidence-first crawl of
        public pages, source verification, and map derivation — all reviewed by you before anything
        publishes.
      </p>
      <SimulatedLabel what="research pipeline (fixture)" />
      <TerminalPipeline steps={SITE_RESEARCH_STEPS} done="Research complete — map and intents await review" />

      <div className="card">
        <div className="intent-head">
          <h3>Crawl sources</h3>
        </div>
        <ul className="recommendation-list">
          <li>Shopify App ping — products and collections the install can already see</li>
          <li>Script ping — public page templates reachable without any merchant credential</li>
          <li>URL fallback — merchant-supplied URLs that need coverage</li>
        </ul>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>Research cadence</h3>
          <SimulatedLabel what="cadence state" />
        </div>
        <p className="muted">
          Monthly research is the Phase I default; the weekly switch activates with the cadence writer.
          Re-running research never auto-publishes — new intents enter review.
        </p>
      </div>

      <BlindSpotFooter
        items={[
          "The step pipeline above is a labeled fixture — the live researcher's job status is not exposed yet.",
          "Research reads public pages and install-scoped data only; it never reads customer data.",
        ]}
      />
    </>
  );
}
