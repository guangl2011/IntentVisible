import { describe, expect, it } from "vitest";

import {
  attributeOrdersToIntents,
  channelQuality,
  classifyGap,
  correlateSessionToOrder,
  correlateVisitToOrder,
  demandGap,
  intentFunnel,
  intentYield,
  opportunityScores,
  type AttributionOrder,
  type AttributionSession,
  type AttributionVisit,
  type DemandEstimate,
} from "../src/attribution.js";
import { AttributionInputError } from "../src/errors.js";

// Deterministic fixture set: two intents, AI-referral sessions, affiliate
// visits with tracking codes, and orders from the Shopify ledger.
const order = (orderId: string, overrides: Partial<AttributionOrder["attribution"]> = {}): AttributionOrder => ({
  orderId,
  netSales: 100,
  refundedAt: null,
  attribution: {
    attribution_basis: "utm",
    utm_source: "chatgpt.com",
    utm_medium: "referral",
    utm_campaign: "solar",
    click_id: null,
    discount_codes: [],
    channel_group: "ai_referral",
    ...overrides,
  },
});

const session = (sessionId: string, overrides: Partial<AttributionSession> = {}): AttributionSession => ({
  sessionId,
  source: "chatgpt.com",
  channelGroup: "ai_referral",
  landedIntentId: null,
  utmSource: "chatgpt.com",
  utmMedium: "referral",
  utmCampaign: "solar",
  ...overrides,
});

const visit = (visitId: string, overrides: Partial<AttributionVisit> = {}): AttributionVisit => ({
  visitId,
  channel: "play",
  partner: "partner_a",
  trackingCode: "IV-S2000",
  landedIntentId: null,
  ...overrides,
});

describe("correlation chains (session → visit → order)", () => {
  it("matches a visit to an order through the shared tracking code", () => {
    const orderWithCode = order("o1", { attribution_basis: "discount_code", discount_codes: ["IV-S2000"] });
    expect(correlateVisitToOrder(visit("v1"), [orderWithCode])?.orderId).toBe("o1");
  });

  it("does not match a visit when no order carries its tracking code", () => {
    expect(correlateVisitToOrder(visit("v1"), [order("o1")])).toBeNull();
  });

  it("matches a session to an order through the full UTM triple", () => {
    expect(correlateSessionToOrder(session("s1"), [order("o1")])?.orderId).toBe("o1");
  });

  it("requires all three UTM fields to match", () => {
    const other = session("s1", { utmCampaign: "camping" });
    expect(correlateSessionToOrder(other, [order("o1")])).toBeNull();
  });

  it("never matches a session with missing UTM fields (dark traffic stays unattributed)", () => {
    const dark = session("s1", { utmSource: null, utmMedium: null, utmCampaign: null });
    expect(correlateSessionToOrder(dark, [order("o1")])).toBeNull();
  });

  it("assigns intents with tracking-code hard attribution over UTM session match", () => {
    const orders = [order("o1", { attribution_basis: "discount_code", discount_codes: ["IV-A"] })];
    const visits = [visit("v1", { trackingCode: "IV-A", landedIntentId: "intent_a" })];
    const sessions = [session("s1", { landedIntentId: "intent_b" })];
    const assignment = attributeOrdersToIntents(orders, sessions, visits);
    expect(assignment.get("o1")).toBe("intent_a");
  });

  it("falls back to the UTM session's landed intent when no visit anchors", () => {
    const orders = [order("o1")];
    const sessions = [session("s1", { landedIntentId: "intent_b" })];
    const assignment = attributeOrdersToIntents(orders, sessions, []);
    expect(assignment.get("o1")).toBe("intent_b");
  });

  it("leaves unanchored orders null — never guesses an intent", () => {
    const assignment = attributeOrdersToIntents([order("o1")], [], []);
    expect(assignment.get("o1")).toBeNull();
  });
});

describe("Intent Yield (orders × intents, measured)", () => {
  it("counts orders and revenue per intent with shares", () => {
    const orders = [
      order("o1", { discount_codes: ["IV-A"], attribution_basis: "discount_code" }),
      order("o2", { discount_codes: ["IV-A"], attribution_basis: "discount_code" }),
      order("o3"),
    ];
    const visits = [visit("v1", { trackingCode: "IV-A", landedIntentId: "intent_a" })];
    const sessions = [session("s1", { landedIntentId: "intent_b" })];
    const rows = intentYield(orders, sessions, visits);
    expect(rows).toEqual([
      { intentId: "intent_a", orderCount: 2, attributedRevenue: 200, revenueSharePct: 66.67, data_mode: "measured" },
      { intentId: "intent_b", orderCount: 1, attributedRevenue: 100, revenueSharePct: 33.33, data_mode: "measured" },
    ]);
  });

  it("labels the view measured — the order ledger is the anchor", () => {
    const rows = intentYield([order("o1")], [], []);
    expect(rows.every((r) => r.data_mode === "measured")).toBe(true);
  });
});

describe("Demand Gap buckets (estimated D vs measured T)", () => {
  const est = (intentId: string, demand: number | null, status: DemandEstimate["measurementStatus"] = "imported"): DemandEstimate => ({
    intentId,
    measurementStatus: status,
    demand,
    source: status === "not_measured" ? null : "keyword_intel_import",
  });

  it("buckets gap ≥ 50% as revenue_expansion", () => {
    expect(classifyGap(50)).toBe("revenue_expansion");
    expect(classifyGap(80)).toBe("revenue_expansion");
  });

  it("buckets 30–49% as market_expansion (edges inclusive)", () => {
    expect(classifyGap(30)).toBe("market_expansion");
    expect(classifyGap(49)).toBe("market_expansion");
    expect(classifyGap(49.99)).toBe("market_expansion");
  });

  it("buckets below 30% as healthy", () => {
    expect(classifyGap(29.99)).toBe("healthy");
    expect(classifyGap(0)).toBe("healthy");
  });

  it("computes coverage and gap from sessions and demand", () => {
    // D=100, T=40 → coverage 0.4, gap 60% → revenue_expansion.
    const rows = demandGap(
      [session("s1", { landedIntentId: "intent_a" }), session("s2", { landedIntentId: "intent_a" }),
       session("s3", { landedIntentId: "intent_a" }), session("s4", { landedIntentId: "intent_a" })],
      [est("intent_a", 100)],
    );
    expect(rows[0]).toMatchObject({
      intentId: "intent_a",
      demand: 100,
      traffic: 4,
      coverage: 0.04,
      gapPct: 96,
      bucket: "revenue_expansion",
      data_mode: "estimated",
    });
  });

  it("keeps not_measured demand not_measured — no invented volumes", () => {
    const rows = demandGap([], [est("intent_a", null, "not_measured")]);
    expect(rows[0]).toMatchObject({
      demand: null,
      demandSource: null,
      coverage: null,
      gapPct: null,
      bucket: "not_measured",
    });
  });

  it("refuses a not_measured estimate that smuggles a demand value", () => {
    expect(() =>
      demandGap([], [{ intentId: "intent_a", measurementStatus: "not_measured", demand: 500, source: null }]),
    ).toThrow(AttributionInputError);
  });

  it("refuses an estimate without provenance", () => {
    expect(() =>
      demandGap([], [{ intentId: "intent_a", measurementStatus: "llm_estimated", demand: 500, source: null }]),
    ).toThrow(AttributionInputError);
  });
});

describe("Channel Quality (traffic × orders, measured)", () => {
  it("computes CVR per channel group", () => {
    const sessions = [session("s1"), session("s2"), session("s3"), session("s4")];
    const rows = channelQuality([order("o1")], sessions);
    expect(rows[0]).toMatchObject({
      channelGroup: "ai_referral",
      sessions: 4,
      orders: 1,
      cvrPct: 25,
      data_mode: "measured",
    });
  });

  it("reports a measured 0 CVR for traffic with no orders", () => {
    const rows = channelQuality([], [session("s1")]);
    expect(rows[0]?.cvrPct).toBe(0);
    expect(rows[0]?.orders).toBe(0);
  });
});

describe("D→T→O funnel and Opportunity Score", () => {
  const orders = [order("o1", { discount_codes: ["IV-A"], attribution_basis: "discount_code" })];
  const visits = [visit("v1", { trackingCode: "IV-A", landedIntentId: "intent_a" })];
  const sessions = [session("s1", { landedIntentId: "intent_a" }), session("s2", { landedIntentId: "intent_a" })];
  const demand: DemandEstimate[] = [
    { intentId: "intent_a", measurementStatus: "imported", demand: 100, source: "keyword_intel_import" },
  ];
  const scoreInput = { baselineCvrPct: 2, baselineCvrSource: "category_baseline_2025" };

  it("builds the per-intent funnel with estimated D and measured T/O", () => {
    const funnel = intentFunnel(orders, sessions, visits, demand);
    expect(funnel[0]).toEqual({
      intentId: "intent_a",
      demand: 100,
      traffic: 2,
      orders: 1,
      coverage: 0.02,
      cvrPct: 50,
    });
  });

  it("scores (D − T) × baseline CVR × AOV, always labeled estimated", () => {
    const rows = opportunityScores(orders, sessions, visits, demand, scoreInput);
    expect(rows[0]).toMatchObject({
      intentId: "intent_a",
      score: 196, // (100 − 2) × 0.02 × 100
      estimated: true,
    });
    expect(rows[0]?.inputs.aov).toBe(100);
  });

  it("sorts deterministically by score desc, intentId asc on ties", () => {
    const twoIntents: DemandEstimate[] = [
      { intentId: "intent_b", measurementStatus: "imported", demand: 50, source: "s" },
      { intentId: "intent_a", measurementStatus: "imported", demand: 200, source: "s" },
    ];
    const rows = opportunityScores([], [], [], twoIntents, scoreInput);
    expect(rows.map((r) => r.intentId)).toEqual(["intent_a", "intent_b"]);
  });

  it("scores a not_measured intent null — the estimated badge stays, the number does not", () => {
    const rows = opportunityScores(
      orders,
      sessions,
      visits,
      [{ intentId: "intent_a", measurementStatus: "not_measured", demand: null, source: null }],
      scoreInput,
    );
    expect(rows[0]?.score).toBeNull();
    expect(rows[0]?.estimated).toBe(true);
  });

  it("requires baseline-CVR provenance", () => {
    expect(() =>
      opportunityScores(orders, sessions, visits, demand, { baselineCvrPct: 2, baselineCvrSource: "" }),
    ).toThrow(AttributionInputError);
  });
});

describe("determinism (same inputs → byte-identical outputs)", () => {
  it("recomputation is stable across every view", () => {
    const orders = [
      order("o1", { discount_codes: ["IV-A"], attribution_basis: "discount_code" }),
      order("o2"),
    ];
    const visits = [visit("v1", { trackingCode: "IV-A", landedIntentId: "intent_a" })];
    const sessions = [session("s1", { landedIntentId: "intent_a" })];
    const demand: DemandEstimate[] = [
      { intentId: "intent_a", measurementStatus: "imported", demand: 100, source: "s" },
      { intentId: "intent_b", measurementStatus: "not_measured", demand: null, source: null },
    ];
    const input = { baselineCvrPct: 2, baselineCvrSource: "s" };

    const run1 = {
      yield: intentYield(orders, sessions, visits),
      gap: demandGap(sessions, demand),
      quality: channelQuality(orders, sessions),
      funnel: intentFunnel(orders, sessions, visits, demand),
      scores: opportunityScores(orders, sessions, visits, demand, input),
    };
    const run2 = {
      yield: intentYield(orders, sessions, visits),
      gap: demandGap(sessions, demand),
      quality: channelQuality(orders, sessions),
      funnel: intentFunnel(orders, sessions, visits, demand),
      scores: opportunityScores(orders, sessions, visits, demand, input),
    };
    expect(run2).toEqual(run1);
    expect(JSON.stringify(run2)).toBe(JSON.stringify(run1));
  });
});
