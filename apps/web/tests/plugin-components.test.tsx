import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { AuditPanels } from "../src/app/(plugin)/plugin/components/audit-panels";
import { EstimatedBadge, HeuristicBadge, SeverityBadge, VisibilityProvenanceBadge, bucketLabel, usd } from "../src/app/(plugin)/plugin/components/badges";
import { AttributionPanels, DemandGapTable, FunnelTable } from "../src/app/(plugin)/plugin/components/attribution-panels";
import { IntentGroupTable, groupByPersonaStage } from "../src/app/(plugin)/plugin/components/buyer-intents-panels";
import { CommissionPanels } from "../src/app/(plugin)/plugin/components/commission-panels";
import { NAV_GROUPS } from "../src/app/(plugin)/plugin/components/plugin-frame";
import { AffiliateVisitsPanel, SettlementPanel } from "../src/app/(plugin)/plugin/components/match-visit-panels";
import { TodaysAlertBlock, StoreSummaryBlock, HealthScoreBlock, healthSubScores } from "../src/app/(plugin)/plugin/components/overview-panels";
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
 * for simulated data. The §2.1 IA grouping is asserted on NAV_GROUPS.
 */

describe("NAV_GROUPS — the §2.1 IA grouping", () => {
  it("groups the plugin surfaces into Build / Optimize / Monetize / Settings", () => {
    const titles = NAV_GROUPS.map((group) => group.title);
    expect(titles).toEqual([
      "Overview",
      "Intent Library · Build",
      "Intent Audit · Optimize",
      "Intent Match · Monetize",
      "Settings",
    ]);
  });

  it("carries every designed surface as a nav entry", () => {
    const entries = NAV_GROUPS.flatMap((group) => group.items);
    const hrefs = entries.map((item) => item.href);
    for (const href of [
      "/plugin",
      "/plugin/site-research",
      "/plugin/marketing-map",
      "/plugin/intents",
      "/plugin/products",
      "/plugin/attribution",
      "/plugin/audit",
      "/plugin/ad-optimization",
      "/plugin/ai-insights",
      "/plugin/match",
      "/plugin/channels",
      "/plugin/affiliate-visit",
      "/plugin/commission",
      "/plugin/integrations",
      "/plugin/billing",
      "/plugin/uninstall",
    ]) {
      expect(hrefs, href).toContain(href);
    }
    // The old dashboard navigation must not leak into the plugin frame.
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

  it("renders an explaining empty state when there are no alerts", () => {
    const html = renderToStaticMarkup(<TodaysAlertBlock alerts={[]} dropOff={null} />);
    expect(html).toContain("No alerts today");
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
      <HealthScoreBlock score={OVERVIEW.intent_health_score} subScores={subScores} />,
    );
    expect(html).toContain("not a conversion or revenue forecast");
    expect(html).toContain("58.33");
    expect(html).toContain("意图覆盖");
    expect(html).toContain("页面承接");
    expect(html).toContain("数据健康");
  });

  it("computes the three sub-scores from the overview payload", () => {
    const subScores = healthSubScores(OVERVIEW, 82);
    expect(subScores.map((s) => s.label)).toEqual([
      "意图覆盖 · Intent coverage",
      "页面承接 · Page readiness",
      "数据健康 · Data health",
    ]);
    expect(subScores[1]?.score).toBe(82);
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
    expect(html).toContain(bucketLabel("revenue_expansion"));
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
