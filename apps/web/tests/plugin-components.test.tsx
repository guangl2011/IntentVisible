import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuditPanels } from "../src/app/(plugin)/plugin/components/audit-panels";
import { EstimatedBadge, HeuristicBadge, SeverityBadge, VisibilityProvenanceBadge, bucketLabel, usd } from "../src/app/(plugin)/plugin/components/badges";
import { AttributionPanels, DemandGapTable, FunnelTable } from "../src/app/(plugin)/plugin/components/attribution-panels";
import { IntentGroupTable, groupByPersonaStage } from "../src/app/(plugin)/plugin/components/buyer-intents-panels";
import { CommissionPanels } from "../src/app/(plugin)/plugin/components/commission-panels";
import { SIDEBAR_ITEMS } from "../src/app/(plugin)/plugin/components/plugin-side-nav";
import { dictionaryFor } from "../src/lib/plugin/i18n/dictionary";
import { AffiliateVisitsPanel, SettlementPanel } from "../src/app/(plugin)/plugin/components/match-visit-panels";
import {
  CrawlCoverageCard,
  TopPagesCard,
  TrafficTrendCard,
  VisitsByTypeCard,
  trendMax,
} from "../src/app/(plugin)/plugin/components/ai-traffic-panels";
import {
  IntentMapBlock,
  IntentPerformanceBlock,
  LandingPagesMonitoredCard,
  ModuleCardsBlock,
  StoreSummaryBlock,
  TodaysAlertBlock,
  aiVisitTrendTotals,
  healthSubScores,
} from "../src/app/(plugin)/plugin/components/overview-panels";
import {
  PlanGrowthBand,
  PlanRatesSection,
  PlanSummaryCard,
  currentBillingCycle,
  exampleChartPoints,
} from "../src/app/(plugin)/plugin/plan/page";
import {
  ATTRIBUTION,
  AUDIT,
  BUYER_INTENTS,
  COMMISSION,
  MATCH_SETTLED,
  MATCH_WITHHELD,
  OVERVIEW,
  VISIBILITY_NOT_MEASURED,
  VISIBILITY_ROLLING,
  VISIBILITY_SINGLE_DAY,
} from "./plugin-fixtures";

/**
 * Plugin Phase I presentational components, rendered with
 * react-dom/server: no DOM, no network — the client data path enters at
 * the props boundary with the same wire shapes the API serves
 * (plugin-fixtures.ts, mirroring the plugin API compute payloads).
 *
 * The red-line assertions live here on purpose: provenance on every
 * measured number, not_measured as its own state, estimated/heuristic
 * labels present, single-day snapshots labeled, and settlement withheld
 * for simulated data. The embedded-app IA is asserted on SIDEBAR_ITEMS.
 */

describe("SIDEBAR_ITEMS — the 7-item embedded sidebar IA", () => {
  it("carries exactly the seven menu items in the mandated order", () => {
    const hrefs = SIDEBAR_ITEMS.map((item) => item.href);
    expect(hrefs).toEqual([
      "/plugin/library",
      "/plugin/audit",
      "/plugin/match",
      "/plugin/ai-traffic",
      "/plugin/commission",
      "/plugin/plan",
      "/plugin/settings",
    ]);
  });

  it("excludes the Overview home from the menu — it stays reachable via the brand link", () => {
    const hrefs = SIDEBAR_ITEMS.map((item) => item.href);
    expect(hrefs, "/plugin").not.toContain("/plugin");
  });

  it("never leaks the old dashboard navigation into the sidebar", () => {
    const hrefs = SIDEBAR_ITEMS.map((item) => item.href);
    for (const legacy of ["/queue", "/research", "/agents", "/history"]) {
      expect(hrefs, legacy).not.toContain(legacy);
    }
  });
});

describe("VisibilityProvenanceBadge — the measured/simulated separation", () => {
  it("renders engines, window, and rolling label for a rolling measurement", () => {
    const html = renderToStaticMarkup(<VisibilityProvenanceBadge visibility={VISIBILITY_ROLLING} />);
    expect(html).toContain("41.2%");
    expect(html).toContain("chatgpt.com, perplexity");
    expect(html).toContain("2026-11-16 → 2026-11-22");
    expect(html).toContain("rolling");
    expect(html).not.toContain("single-day");
  });

  it("labels a single-day snapshot as one, never as steady state", () => {
    const html = renderToStaticMarkup(<VisibilityProvenanceBadge visibility={VISIBILITY_SINGLE_DAY} />);
    expect(html).toContain("12.8%");
    expect(html).toContain("single-day snapshot");
  });

  it("renders not_measured as its own state — never a fabricated value", () => {
    const html = renderToStaticMarkup(<VisibilityProvenanceBadge visibility={VISIBILITY_NOT_MEASURED} />);
    expect(html).toContain("not measured");
    expect(html).not.toContain("%");
    expect(html).not.toContain("null");
  });
});

describe("Buyer Intents — persona × stage grouping and prompt provenance", () => {
  it("groups units by persona then stage, sorted", () => {
    const groups = groupByPersonaStage(BUYER_INTENTS);
    expect(groups.map((g) => g.persona)).toEqual([
      "Off-grid cabin owner",
      "Overlanding weekend planner",
      "Van-life weekend cook",
    ]);
    expect(groups[1]?.stages[0]?.stage).toBe("Comparison");
  });

  it("renders prompt cards with status and scope next to each intent", () => {
    const html = renderToStaticMarkup(<IntentGroupTable units={BUYER_INTENTS} />);
    expect(html).toContain("S2000 vs rival power stations");
    expect(html).toContain("what watt solar panel charges a s2000 in one day");
    expect(html).toContain("badge-PENDING_REVIEW");
  });

  it("renders the explicit empty state when no intents exist", () => {
    const html = renderToStaticMarkup(<IntentGroupTable units={[]} />);
    expect(html).toContain("No buyer intents yet");
  });
});

describe("Overview §2.2 — alerts, summary provenance, heuristic gauge", () => {
  it("renders each alert with its typed reason and severity", () => {
    const html = renderToStaticMarkup(<TodaysAlertBlock alerts={OVERVIEW.todays_alerts} dropOff={null} />);
    expect(html).toContain("Review queue");
    expect(html).toContain("Measurement quality");
    expect(html).toContain("badge-P1");
    expect(html).toContain("badge-P2");
    expect(html).toContain("single-day snapshot");
  });

  it("renders the Intent Drop-off warning as its own alert state", () => {
    const html = renderToStaticMarkup(
      <TodaysAlertBlock alerts={[]} dropOff={{ sessions: 5, orders: 0 }} />,
    );
    expect(html).toContain("Intent Drop-off");
  });

  it("renders the calm all-clear card when there are no alerts", () => {
    const html = renderToStaticMarkup(<TodaysAlertBlock alerts={[]} dropOff={null} />);
    expect(html).toContain("All clear");
  });

  it("carries the provenance footer on the Agentic Store Summary", () => {
    const html = renderToStaticMarkup(<StoreSummaryBlock summary={OVERVIEW.agentic_store_summary} />);
    expect(html).toContain("Generated by fixture-seed");
    expect(html).toContain("2026-11-16 → 2026-11-22");
    expect(html).toContain("AI / affiliate sessions (7d)");
  });

  it("renders the gauge with the three §2.2 sub-scores and the heuristic label", () => {
    const subScores = healthSubScores(OVERVIEW, null);
    const html = renderToStaticMarkup(
      <IntentMapBlock score={OVERVIEW.intent_health_score} subScores={subScores} readinessMeasured={false} />,
    );
    expect(html).toContain("not a conversion or revenue forecast");
    expect(html).toContain("58.33");
    expect(html).toContain("Intent coverage");
    expect(html).toContain("Page readiness");
    expect(html).toContain("Data health");
  });

  it("renders the Intent Map heading with the gauge and monitored-pages cards side by side", () => {
    const subScores = healthSubScores(OVERVIEW, null);
    const html = renderToStaticMarkup(
      <IntentMapBlock score={OVERVIEW.intent_health_score} subScores={subScores} readinessMeasured={false} />,
    );
    expect(html).toContain("data-block=\"intent-map\"");
    expect(html).toContain("Intent Map");
    expect(html).toContain("data-testid=\"health-gauge\"");
    expect(html).toContain("data-testid=\"landing-pages-monitored\"");
  });

  it("labels the monitored-pages card simulated and keeps its per-type breakdown", () => {
    const html = renderToStaticMarkup(<LandingPagesMonitoredCard />);
    expect(html).toContain("simulated ·");
    expect(html).toContain("Products");
    expect(html).toContain("Collections");
  });
});

describe("Module Cards — the three parallel module cards", () => {
  it("renders the three module cards with icons, metrics, descriptions, and page links", () => {
    const html = renderToStaticMarkup(
      <ModuleCardsBlock
        data={{ activeIntentCount: 7, avgReadiness: 72, attributedOrders: 3, billedNet: 41 }}
      />,
    );
    expect(html).toContain("data-block=\"module-cards\"");
    expect(html).toContain("iv-module-grid");
    expect(html).toContain("iv-module-library");
    expect(html).toContain("iv-module-audit");
    expect(html).toContain("iv-module-match");
    expect(html).toContain("Open Intent Library");
    expect(html).toContain("Open Intent Audit");
    expect(html).toContain("Open Intent Match");
  });

  it("shows the readiness-missing state, never a fabricated average", () => {
    const html = renderToStaticMarkup(
      <ModuleCardsBlock
        data={{ activeIntentCount: 7, avgReadiness: null, attributedOrders: 0, billedNet: 0 }}
      />,
    );
    expect(html).toContain("Landing page audit has not scored any intent yet.");
  });
});

describe("Intent Performance — traffic, insights, affiliate orders", () => {
  it("renders the three Track columns with a simulated traffic label and measured orders", () => {
    const html = renderToStaticMarkup(<IntentPerformanceBlock data={{ attributedOrders: 3 }} />);
    expect(html).toContain("data-testid=\"performance-traffic\"");
    expect(html).toContain("data-testid=\"performance-insights\"");
    expect(html).toContain("data-testid=\"performance-affiliate\"");
    expect(html).toContain("simulated ·");
    expect(html).toContain("measured");
  });

  it("shows the no-live-data state for the AI insights track, never a made-up number", () => {
    const html = renderToStaticMarkup(<IntentPerformanceBlock data={{ attributedOrders: 3 }} />);
    expect(html).toContain("data-testid=\"performance-insights\"");
    expect(html).not.toContain("badge-measured");
  });

  it("totals the per-day AI-visit series for the trend spark", () => {
    expect(aiVisitTrendTotals([{ day: "2026-11-20", series: { claude: 2, chatgpt: 3 } }])).toEqual([5]);
  });

  it("computes the three sub-scores from the overview payload", () => {
    const subScores = healthSubScores(OVERVIEW, 82);
    expect(subScores.map((s) => s.key)).toEqual(["coverage", "readiness", "dataHealth"]);
    expect(subScores[1]?.score).toBe(82);
  });
});

describe("Intent Traffic — coverage, by-type, trend, top pages", () => {
  it("renders the coverage donut with the collected/total share and per-type rows", () => {
    const html = renderToStaticMarkup(<CrawlCoverageCard />);
    expect(html).toContain("%");
    expect(html).toContain("simulated ·");
    expect(html).toContain("Products");
  });

  it("renders the by-page-type bar chart with counts and share of total", () => {
    const html = renderToStaticMarkup(<VisitsByTypeCard />);
    expect(html).toContain("%");
    expect(html).toContain("simulated ·");
  });

  it("renders the trend with the platform legend and toggle labels", () => {
    const html = renderToStaticMarkup(<TrafficTrendCard />);
    expect(html).toContain("Claude");
    expect(html).toContain("ChatGPT");
    expect(html).toContain("Perplexity");
    expect(html).toContain("data-testid=\"trend-by-platform\"");
    expect(html).toContain("data-testid=\"trend-by-category\"");
  });

  it("renders the top-pages table with visit shares only", () => {
    const html = renderToStaticMarkup(<TopPagesCard />);
    expect(html).toContain("data-testid=\"ai-top-pages\"");
    expect(html).toContain("simulated ·");
  });

  it("shares one scale across both trend views so the toggle never rescales", () => {
    const flat = [
      { day: "d1", series: { claude: 4 } },
      { day: "d2", series: { claude: 8 } },
    ];
    expect(trendMax(flat, flat)).toBe(8);
  });
});

describe("Plan — performance-billing model card", () => {
  it("shows $0 monthly fee, the measured billing cycle, and the checklist", () => {
    const cycle = currentBillingCycle(COMMISSION);
    expect(cycle).not.toBeNull();
    const html = renderToStaticMarkup(<PlanSummaryCard cycle={cycle} />);
    expect(html).toContain("$0");
    expect(html).toContain("measured");
    expect(html).toContain("data-testid=\"plan-checklist\"");
  });

  it("claims no first-N-orders-free waiver the engine does not configure", () => {
    const html = renderToStaticMarkup(<PlanSummaryCard cycle={null} />);
    expect(html).toContain("5–20%");
    expect(html).not.toContain("first 50");
  });

  it("shows a dash for the billing cycle when the ledger is empty", () => {
    const html = renderToStaticMarkup(<PlanSummaryCard cycle={null} />);
    expect(html).not.toContain("measured");
  });

  it("expands the per-category rates within the locked 5–20% band", () => {
    const html = renderToStaticMarkup(<PlanRatesSection />);
    expect(html).toContain("5–20%");
  });

  it("marks the growth-band chart EXAMPLE — an illustration, not data", () => {
    const html = renderToStaticMarkup(<PlanGrowthBand />);
    expect(html).toContain("EXAMPLE");
    expect(html).toContain("simulated ·");
  });

  it("computes layered example-chart polylines", () => {
    const points = exampleChartPoints([[0, 10], [5, 5]], 100, 100);
    expect(points).toHaveLength(2);
    expect(points[0]).toBe("0.0,100.0 100.0,6.0");
  });
});

describe("Attribution — estimated labels and withheld fabrications", () => {
  it("wears the estimated badge on the Opportunity Score table", () => {
    const html = renderToStaticMarkup(<AttributionPanels payload={ATTRIBUTION} />);
    expect(html).toContain("estimated");
    expect(html).toContain("every score on this table is estimated");
    expect(html).toContain("withheld — not measurable for this unit");
  });

  it("shows the withheld-coverage note instead of an invented number", () => {
    const html = renderToStaticMarkup(<FunnelTable rows={ATTRIBUTION.funnel} />);
    expect(html).toContain("no invented search volumes");
    expect(html).toContain("withheld rather than fabricated");
  });

  it("buckets demand gaps with the locked thresholds", () => {
    const html = renderToStaticMarkup(<DemandGapTable rows={ATTRIBUTION.demand_gap} />);
    expect(html).toContain(bucketLabel("revenue_expansion", dictionaryFor("en")));
    expect(html).toContain("Not measured");
    expect(html).toContain("llm_estimated");
  });

  it("renders the estimated badge helper standalone", () => {
    expect(renderToStaticMarkup(<EstimatedBadge />)).toContain("estimated");
  });
});

describe("Intent Audit — heuristic readiness and the 5–20% rate band", () => {
  it("labels readiness as a heuristic and cites intent ids in recommendations", () => {
    const html = renderToStaticMarkup(<AuditPanels payload={AUDIT} />);
    expect(html).toContain("not a guarantee of performance");
    expect(html).toContain("intent_solar_sizing");
    expect(html).toContain("Pending review");
  });

  it("shows Track A within the locked 5–20% band and Track B as a Phase II stub", () => {
    const html = renderToStaticMarkup(<AuditPanels payload={AUDIT} />);
    expect(html).toContain("5%–20% (tiered)");
    expect(html).toContain("order attribution commission");
    expect(html).toContain("Phase II stub");
  });
});

describe("Intent Match — settlement withheld for simulated data", () => {
  it("renders the withheld state with its reason, never a computed settlement", () => {
    const html = renderToStaticMarkup(<SettlementPanel settlement={MATCH_WITHHELD.settlement} />);
    expect(html).toContain("Settlement — withheld");
    expect(html).toContain("Settlement computes only over provider_measured data");
    expect(html).not.toContain("TID-PLAY-001</td>");
  });

  it("renders per-code settlement only when the data mode is provider_measured", () => {
    const html = renderToStaticMarkup(<SettlementPanel settlement={MATCH_SETTLED.settlement} />);
    expect(html).toContain("Settlement per tracking code");
    expect(html).toContain("TID-PLAY-001");
    expect(html).toContain("$9.65");
  });

  it("renders affiliate visits with channel, partner, and tracking provenance", () => {
    const html = renderToStaticMarkup(<AffiliateVisitsPanel payload={MATCH_WITHHELD} />);
    expect(html).toContain("Affiliate visits by channel / partner / intent");
    expect(html).toContain("ai-catalog-weekly");
    expect(html).toContain("TID-PLAY-002");
    expect(html).toContain("no order yet");
  });
});

describe("Commission — per-order reconciliation and refund offsets", () => {
  it("pins the order-traceability promise and shows gross → offsets → net", () => {
    const html = renderToStaticMarkup(<CommissionPanels payload={COMMISSION} />);
    expect(html).toContain("Every commission traces to a specific order number and reconciles against Shopify");
    expect(html).toContain("5–20%");
    expect(html).toContain("−$19.31");
    expect(html).toContain("$19.32");
    expect(html).toContain("refund offset");
  });

  it("renders statuses through the pending → confirmed → refunded machine", () => {
    const html = renderToStaticMarkup(<CommissionPanels payload={COMMISSION} />);
    expect(html).toContain("badge-APPROVED");
    expect(html).toContain("badge-DENIED");
    expect(html).toContain("badge-PENDING_APPROVAL");
  });

  it("explains the empty state rather than rendering a bare zero", () => {
    const html = renderToStaticMarkup(
      <CommissionPanels
        payload={{ ...COMMISSION, per_order: [], entries: [], totals: { gross: 0, refunds: 0, net: 0 } }}
      />,
    );
    expect(html).toContain("No attributed orders yet — nothing is billed");
  });
});

describe("small label helpers", () => {
  it("renders severity chips and the heuristic badge", () => {
    expect(renderToStaticMarkup(<SeverityBadge severity="p0" />)).toContain("P0");
    expect(renderToStaticMarkup(<HeuristicBadge />)).toContain("heuristic");
  });

  it("formats negative USD amounts with a minus sign", () => {
    expect(usd(-19.31)).toBe("−$19.31");
    expect(usd(19.31)).toBe("$19.31");
  });
});
