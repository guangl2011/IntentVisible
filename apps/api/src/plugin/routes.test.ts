/**
 * Route tests for the plugin Phase I surface (task todo_IC3srLZp). The
 * routes mount over the deterministic demo seed (plugin-schema) served by
 * the Drizzle read store; every assertion runs against HTTP responses via
 * app.inject — no live LLM, no network, no API keys.
 *
 * Coverage per the task's verification list: provenance fields
 * (source_engines, measurement_window), not_measured handling, data_mode
 * header + rejection, and refund-offset ledger reads.
 */

import { describe, expect, it } from "vitest";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";

import { DEMO_SHOP_ID, SEED_AS_OF } from "@intentvisible/plugin-schema/seed";

import { registerPluginRoutes } from "./routes.js";
import { DrizzlePluginReadStore, openSeededPluginDb } from "./store.js";
import { buildCommissionLedger, gapBucket } from "./compute.js";
import type { CommissionRow } from "./store.js";

const SHOP = DEMO_SHOP_ID;
const base = `/v1/plugin/shops/${SHOP}`;

async function makeApp(): Promise<FastifyInstance> {
  const app = Fastify();
  registerPluginRoutes(app, {
    store: new DrizzlePluginReadStore(await openSeededPluginDb()),
    dataMode: "llm_simulated",
    asOf: SEED_AS_OF,
  });
  return app;
}

describe("data_mode contract (all plugin endpoints)", () => {
  const paths = ["overview", "intents", "attribution", "audit", "match", "commission"];

  it.each(paths)("sets a data_mode header on GET %s", async (path) => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/${path}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["data_mode"]).toBe("llm_simulated");
  });

  it("serves when the request asks for the serving mode", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/overview`, headers: { data_mode: "llm_simulated" } });
    expect(res.statusCode).toBe(200);
  });

  it("rejects a request for a different mode with a typed data_mode_mismatch", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/overview`, headers: { data_mode: "provider_measured" } });
    expect(res.statusCode).toBe(400);
    expect(res.headers["data_mode"]).toBe("llm_simulated");
    const body = res.json();
    expect(body.error.reason).toBe("data_mode_mismatch");
    expect(body.error.detail).toContain("mixed modes are never served");
  });

  it("rejects two data_mode values collapsed into one header (mixed request)", async () => {
    const app = await makeApp();
    // Fastify joins duplicate headers with ", "; the joined value fails the
    // mode enum — the mixed request is rejected either way.
    const res = await app.inject({
      method: "GET",
      url: `${base}/overview`,
      headers: { data_mode: "llm_simulated, provider_measured" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.reason).toBe("invalid_request");
  });

  it("rejects an unknown data_mode value", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/overview`, headers: { data_mode: "search_volume" } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.reason).toBe("invalid_request");
  });

  it("404s an unknown shop", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: "/v1/plugin/shops/shop_unknown/overview" });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.reason).toBe("not_found");
  });
});

describe("overview module", () => {
  it("renders typed alerts, a provenance-carrying summary, and a heuristic health score", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/overview` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.shop_id).toBe(SHOP);
    expect(body.as_of).toBe(SEED_AS_OF);

    const reasonKinds = body.todays_alerts.map((a: { reason_kind: string }) => a.reason_kind);
    expect(reasonKinds).toContain("intent_pending_review");
    expect(reasonKinds).toContain("visibility_not_measured");
    expect(reasonKinds).toContain("single_day_snapshot");
    expect(reasonKinds).toContain("refund_offset_recorded");
    expect(reasonKinds).toContain("first_intent_attributed_order");
    for (const alert of body.todays_alerts) {
      expect(alert.reason_kind).toBeTruthy();
      expect(alert.severity).toMatch(/^p[012]$/);
    }

    expect(body.agentic_store_summary.provenance.generated_by).toBe("fixture-seed");
    expect(body.agentic_store_summary.key_numbers).toEqual({
      active_intent_count: 3,
      persona_count: 4,
      ai_referral_sessions_7d: 5,
    });

    expect(body.intent_health_score.kind).toBe("heuristic");
    expect(body.intent_health_score.components).toHaveLength(3);
  });

  it("is deterministic across calls", async () => {
    const app = await makeApp();
    const first = await app.inject({ method: "GET", url: `${base}/overview` });
    const second = await app.inject({ method: "GET", url: `${base}/overview` });
    expect(first.body).toBe(second.body);
  });
});

describe("buyer intents module", () => {
  it("carries visibility provenance: engine set and measurement window", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/intents` });
    expect(res.statusCode).toBe(200);

    const intents = res.json().intents;
    expect(intents).toHaveLength(4);

    const rivals = intents.find((i: { intent_id: string }) => i.intent_id === "intent_s2000_vs_rivals");
    expect(rivals.visibility.measurement_status).toBe("measured");
    expect(rivals.visibility.source_engines).toEqual(["chatgpt.com", "perplexity"]);
    expect(rivals.visibility.measurement_window_start).toBe("2026-11-16");
    expect(rivals.visibility.measurement_window_end).toBe("2026-11-22");
    expect(rivals.prompts).toHaveLength(2);
    expect(rivals.evidence_urls.length).toBeGreaterThan(0);
  });

  it("labels the single-day snapshot as its own state", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/intents` });
    const fridge = res.json().intents.find((i: { intent_id: string }) => i.intent_id === "intent_how_long_fridge");
    expect(fridge.visibility.measurement_kind).toBe("single_day");
    expect(fridge.visibility.measurement_window_start).toBe(fridge.visibility.measurement_window_end);
  });

  it("serves not_measured as its own state — never a fabricated value", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/intents` });
    const solar = res.json().intents.find((i: { intent_id: string }) => i.intent_id === "intent_solar_sizing");
    expect(solar.visibility.measurement_status).toBe("not_measured");
    expect(solar.visibility.visibility_pct).toBeNull();
    expect(solar.visibility.source_engines).toBeNull();
    expect(solar.visibility.measurement_window_start).toBeNull();
    expect(solar.visibility.measurement_window_end).toBeNull();

    const detail = await app.inject({ method: "GET", url: `${base}/intents/intent_solar_sizing` });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().visibility.measurement_status).toBe("not_measured");
  });

  it("404s an unknown intent on the detail route", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/intents/intent_unknown` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.reason).toBe("not_found");
  });
});

describe("attribution module", () => {
  it("serves intent yield, demand gap, channel quality, funnel, and opportunity scores", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/attribution` });
    expect(res.statusCode).toBe(200);

    const body = res.json();

    const camping = body.intent_yield.find((r: { intent_id: string }) => r.intent_id === "intent_camping_power_rec");
    expect(camping.orders).toBe(1);
    expect(camping.gross_sales).toBe(499);
    expect(camping.refunded_sales).toBe(499);
    expect(camping.net_sales).toBe(0);

    const rivals = body.demand_gap.find((r: { intent_id: string }) => r.intent_id === "intent_s2000_vs_rivals");
    expect(rivals.demand.basis).toBe("llm_estimated");
    expect(typeof rivals.demand.tier).toBe("string"); // tier-only: never a volume
    expect(rivals.gap_pct).toBe(58.8); // 100 - 41.2 measured visibility
    expect(rivals.bucket).toBe("revenue_expansion");

    const solar = body.demand_gap.find((r: { intent_id: string }) => r.intent_id === "intent_solar_sizing");
    expect(solar.bucket).toBe("not_measured");
    expect(solar.gap_pct).toBeNull();

    const aiReferral = body.channel_quality.find((r: { channel: string }) => r.channel === "ai_referral");
    expect(aiReferral.sessions).toBe(5);
    expect(aiReferral.cvr).toBe(0.4); // 2 orders / 5 sessions

    const rivalsFunnel = body.funnel.find((r: { intent_id: string }) => r.intent_id === "intent_s2000_vs_rivals");
    expect(rivalsFunnel.traffic_sessions).toBe(2);
    expect(rivalsFunnel.attributed_orders).toBe(1);
    expect(rivalsFunnel.coverage).toBeNull();
    expect(rivalsFunnel.coverage_note).toContain("no invented search volumes");

    for (const score of body.opportunity_scores) {
      expect(score.basis).toBe("estimated");
    }
    const solarScore = body.opportunity_scores.find((r: { intent_id: string }) => r.intent_id === "intent_solar_sizing");
    expect(solarScore.score).toBeNull();
  });
});

describe("audit module", () => {
  it("serves heuristic readiness, intent-referencing recommendations, and performance billing", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/audit` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.readiness.kind).toBe("heuristic");
    expect(body.readiness.per_intent.find((r: { intent_id: string }) => r.intent_id === "intent_solar_sizing").state).toBe(
      "pending_review",
    );

    const recommendationIntents = body.recommendations.map((r: { intent_id: string }) => r.intent_id);
    expect(recommendationIntents).toContain("intent_solar_sizing");
    expect(recommendationIntents).toContain("intent_how_long_fridge"); // single-day re-measure

    expect(body.performance_billing.track_a.rate_band).toEqual({ min: 0.05, max: 0.2 });
    expect(body.performance_billing.track_a.entries_count).toBe(3);
    expect(body.performance_billing.track_b.status).toBe("phase_2_stub");
  });
});

describe("match module", () => {
  it("serves affiliate visits with channel/partner views", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/match` });
    expect(res.statusCode).toBe(200);

    const body = res.json();
    expect(body.affiliate_visits).toHaveLength(4);
    const visit = body.affiliate_visits.find((v: { visit_id: string }) => v.visit_id === "visit_001");
    expect(visit.tracking_code).toBe("IV-PLAY-S2000");
    expect(visit.order_number).toBe("#1001");

    expect(body.by_channel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ channel: "play", visits: 3, orders: 2 }),
        expect.objectContaining({ channel: "ads", visits: 1, orders: 1 }),
      ]),
    );
    expect(body.by_partner).toEqual(
      expect.arrayContaining([expect.objectContaining({ partner: "overland-digest", visits: 2, orders: 1 })]),
    );
  });

  it("withholds settlement over llm_simulated data", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/match` });
    const settlement = res.json().settlement;
    expect(settlement.status).toBe("withheld");
    expect(settlement.reason).toContain("provider_measured");
  });
});

describe("commission ledger module", () => {
  it("reconciles gross → refund offsets → net per order", async () => {
    const app = await makeApp();
    const res = await app.inject({ method: "GET", url: `${base}/commission` });
    expect(res.statusCode).toBe(200);

    const body = res.json();

    const refunded = body.per_order.find((r: { order_id: string }) => r.order_id === "ord_1002");
    expect(refunded).toEqual({
      order_id: "ord_1002",
      order_number: "#1002",
      gross_commission: 49.9,
      refund_offsets: -49.9,
      net_commission: 0,
      status: "refunded",
    });

    const pending = body.per_order.find((r: { order_id: string }) => r.order_id === "ord_1001");
    expect(pending.status).toBe("pending");
    expect(pending.net_commission).toBe(24.9);

    expect(body.totals).toEqual({ gross: 146.72, refunds: -49.9, net: 96.82 });
    // The dark-traffic order is deliberately never billed.
    expect(body.unbilled_order_ids).toEqual(["ord_1004"]);

    const offsetEntry = body.entries.find(
      (e: { entry: { entry_type: string } }) => e.entry.entry_type === "refund_offset",
    );
    expect(offsetEntry.entry.amount).toBeLessThan(0);
    expect(offsetEntry.entry.offsets_entry_id).not.toBeNull();
    expect(offsetEntry.order_id).toBe("ord_1002");

    for (const entry of body.entries) {
      expect(entry.entry.rate).toBeGreaterThanOrEqual(0.05);
      expect(entry.entry.rate).toBeLessThanOrEqual(0.2);
    }
  });
});

describe("pure reconciliation helpers", () => {
  it("buckets gap_pct at the 50 / 30 boundaries", () => {
    expect(gapBucket(50)).toBe("revenue_expansion");
    expect(gapBucket(49.9)).toBe("market_expansion");
    expect(gapBucket(30)).toBe("market_expansion");
    expect(gapBucket(29.9)).toBe("healthy");
  });

  it("reconciles a ledger where refunds outweigh nothing — offsets stay negative", () => {
    const commission = {
      entryId: 1,
      orderId: "ord_x",
      intentId: null,
      channel: "play",
      trackingCode: "IV-X",
      billedPeriodStart: "2026-11-20",
      billedPeriodEnd: "2026-11-20",
      entry: {
        entry_type: "commission" as const,
        status: "confirmed" as const,
        rate: 0.1,
        base_amount: 100,
        amount: 10,
        offsets_entry_id: null,
      },
    };
    const offset: CommissionRow = {
      ...commission,
      entryId: 2,
      entry: {
        entry_type: "refund_offset" as const,
        status: "refunded" as const,
        rate: 0.1,
        base_amount: 100,
        amount: -10,
        offsets_entry_id: 1,
      },
    };
    const ledger = buildCommissionLedger({ orders: [], commissions: [commission, offset] });
    expect(ledger.totals).toEqual({ gross: 10, refunds: -10, net: 0 });
    expect(ledger.per_order[0]?.net_commission).toBe(0);
  });
});
