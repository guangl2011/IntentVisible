"use client";

import { SITE_RESEARCH_STEPS } from "../../../../lib/plugin/demo-fixtures";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter, SimulatedLabel } from "../components/red-lines";
import { TerminalPipeline } from "../components/visual-patterns";

/**
 * Site Research (design v1.4 §2.3, §2.9 pattern 1): the terminal-style
 * step pipeline — scan → source verification → map derivation — with
 * the source list and the monthly/weekly cadence switch (a Phase I
 * display until the cadence writer ships).
 */
export default function SiteResearchPage() {
  const t = useT();
  return (
    <>
      <h1>{t.siteResearch.title}</h1>
      <p className="muted">{t.siteResearch.intro}</p>
      <SimulatedLabel what={t.simLabels.pipeline} />
      <TerminalPipeline steps={SITE_RESEARCH_STEPS} done={t.siteResearch.pipelineDone} />

      <div className="card">
        <div className="intent-head">
          <h3>{t.siteResearch.sourcesTitle}</h3>
        </div>
        <ul className="recommendation-list">
          {t.siteResearch.sources.map((source) => (
            <li key={source}>{source}</li>
          ))}
        </ul>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>{t.siteResearch.cadenceTitle}</h3>
          <SimulatedLabel what={t.simLabels.cadence} />
        </div>
        <p className="muted">{t.siteResearch.cadenceBody}</p>
      </div>

      <BlindSpotFooter items={t.blindSpots.siteResearch} />
    </>
  );
}
