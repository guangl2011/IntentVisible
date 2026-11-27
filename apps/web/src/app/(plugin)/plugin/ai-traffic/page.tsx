"use client";

import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter } from "../components/red-lines";
import {
  CrawlCoverageCard,
  TopPagesCard,
  TrafficTrendCard,
  VisitsByTypeCard,
} from "../components/ai-traffic-panels";

/**
 * Intent Traffic (DeepLumen AI Traffic layout): crawl coverage, visits by
 * page type, trend, and top pages. Phase I has no live crawler-visit
 * data — every block renders the labeled fixture pool, and the surface's
 * guardrail is the visit-share line, never a conversion promise.
 */

export default function AiTrafficPage() {
  const t = useT();
  return (
    <>
      <h1>{t.aiTraffic.title}</h1>
      <p className="muted">{t.aiTraffic.intro}</p>
      <p className="ai-guardrail" data-testid="ai-traffic-guardrail">
        {t.aiTraffic.guardrail}
      </p>

      <div className="ai-traffic-grid">
        <CrawlCoverageCard />
        <VisitsByTypeCard />
      </div>

      <TrafficTrendCard />

      <TopPagesCard />

      <BlindSpotFooter items={t.blindSpots.aiTraffic} />
    </>
  );
}
