/**
 * Intent attribution correlation model (design v1.4 §1.8).
 *
 * Attribution here is NOT single-metric reporting — traffic and order
 * analytics live in the merchant's own tools. This engine correlates three
 * planes by `intentId`: demand estimates (I, estimated), sessions/visits
 * (T, measured), and the Shopify order ledger (O, the only measured
 * anchor). Outputs are the design's views: Intent Yield, Demand Gap,
 * Channel Quality, the per-intent D→T→O funnel, and Opportunity Score.
 *
 * Measurement red lines enforced structurally:
 * - Demand (D) enters only as a provenance-carrying estimate. A
 *   not_measured demand stays not_measured — the engine never substitutes
 *   a number, so no invented search volumes can flow through.
 * - Order and traffic counts are measured and labeled as such; anything
 *   derived from D carries `estimated: true`.
 * - Every function is pure and deterministic: same inputs, byte-identical
 *   outputs (stable sorts, deterministic tie-breaks, rounded arithmetic).
 */

import type { AttributionBasis, SourceEngine } from "@intentvisible/plugin-schema";

import { AttributionInputError } from "./errors.js";

/** Round to 2 decimals for every derived rate and score. */
function round2(value: number): number {
  return Math.sign(value) * Math.round(Math.abs(value) * 100) / 100;
}

// ---------------------------------------------------------------------------
// Inputs — plain structural shapes the API layer maps DB rows onto.
// ---------------------------------------------------------------------------

/** UTM/attribution fields of an order (mirrors OrderAttributionContract). */
export interface OrderAttributionFields {
  attribution_basis: AttributionBasis;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  click_id: string | null;
  discount_codes: string[];
  channel_group: string;
}

/** One order from the Shopify ledger (the measured O plane). */
export interface AttributionOrder {
  orderId: string;
  netSales: number;
  attribution: OrderAttributionFields;
  refundedAt: string | null;
}

/** One AI-referral session (the measured T plane, AI-engine referrers). */
export interface AttributionSession {
  sessionId: string;
  source: SourceEngine;
  /** Channel classification carried by the pixel event (design §1.5). */
  channelGroup: string;
  landedIntentId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
}

/** One Intent Match affiliate visit (measured T plane, tracking-code anchored). */
export interface AttributionVisit {
  visitId: string;
  channel: string;
  trackingCode: string;
  landedIntentId: string | null;
}

/**
 * Market-demand estimate for one intent (the estimated I plane). The
 * engine refuses to run with a not_measured estimate that carries a
 * number — that substitution is exactly the invented-volume red line.
 */
export interface DemandEstimate {
  intentId: string;
  measurementStatus: "not_measured" | "llm_estimated" | "imported";
  /** Estimated demand (search volume × expected CTR × scenario coverage). */
  demand: number | null;
  /** Where the estimate came from — required whenever demand is a number. */
  source: string | null;
}

// ---------------------------------------------------------------------------
// Correlation: sessions/visits → orders → intents.
// ---------------------------------------------------------------------------

/** An order correlates to a visit when the visit's tracking code is one of the order's discount codes (the same tracking-code system, design §2.5). */
export function correlateVisitToOrder(
  visit: AttributionVisit,
  orders: AttributionOrder[],
): AttributionOrder | null {
  const matches = orders
    .filter((o) => o.attribution.discount_codes.includes(visit.trackingCode))
    .sort((a, b) => (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0));
  return matches[0] ?? null;
}

/** An order correlates to a session when both carry the same full UTM triple. */
export function correlateSessionToOrder(
  session: AttributionSession,
  orders: AttributionOrder[],
): AttributionOrder | null {
  if (session.utmSource === null || session.utmMedium === null || session.utmCampaign === null) {
    return null;
  }
  const matches = orders
    .filter(
      (o) =>
        o.attribution.utm_source === session.utmSource &&
        o.attribution.utm_medium === session.utmMedium &&
        o.attribution.utm_campaign === session.utmCampaign,
    )
    .sort((a, b) => (a.orderId < b.orderId ? -1 : a.orderId > b.orderId ? 1 : 0));
  return matches[0] ?? null;
}

/**
 * Assign each order an intentId. Precedence: the tracking-code hard anchor
 * (visit → discount code, mirroring the Phase I discount-code hard
 * attribution) over the UTM session match; ties break deterministically on
 * intentId, then on whichever source reported first by sort order.
 */
export function attributeOrdersToIntents(
  orders: AttributionOrder[],
  sessions: AttributionSession[],
  visits: AttributionVisit[],
): Map<string, string | null> {
  const assignment = new Map<string, string | null>();

  for (const order of orders) {
    let intentId: string | null = null;
    for (const visit of visits) {
      if (correlateVisitToOrder(visit, [order]) !== null && visit.landedIntentId !== null) {
        if (intentId === null || visit.landedIntentId < intentId) {
          intentId = visit.landedIntentId;
        }
      }
    }
    if (intentId === null) {
      const candidates: string[] = [];
      for (const session of sessions) {
        if (
          correlateSessionToOrder(session, [order]) !== null &&
          session.landedIntentId !== null
        ) {
          candidates.push(session.landedIntentId);
        }
      }
      if (candidates.length > 0) {
        intentId = candidates.sort()[0]!;
      }
    }
    assignment.set(order.orderId, intentId);
  }
  return assignment;
}

// ---------------------------------------------------------------------------
// View 1: Intent Yield (orders × intents — measured).
// ---------------------------------------------------------------------------

export interface IntentYieldRow {
  intentId: string;
  /** Measured from the Shopify order ledger. */
  orderCount: number;
  /** Sum of net sales of attributed orders (measured). */
  attributedRevenue: number;
  /** Share of total attributed revenue, 0–100. */
  revenueSharePct: number;
  data_mode: "measured";
}

/**
 * Intent Yield: per intent, how many orders and how much revenue. Orders
 * with no intent assignment are grouped under null and excluded from the
 * per-intent rows but counted in the total for shares.
 */
export function intentYield(
  orders: AttributionOrder[],
  sessions: AttributionSession[],
  visits: AttributionVisit[],
): IntentYieldRow[] {
  const assignment = attributeOrdersToIntents(orders, sessions, visits);
  const totalRevenue = orders.reduce((sum, o) => sum + o.netSales, 0);

  const byIntent = new Map<string, { orderCount: number; revenue: number }>();
  for (const order of orders) {
    const intentId = assignment.get(order.orderId) ?? null;
    if (intentId === null) continue;
    const row = byIntent.get(intentId) ?? { orderCount: 0, revenue: 0 };
    row.orderCount += 1;
    row.revenue += order.netSales;
    byIntent.set(intentId, row);
  }

  return [...byIntent.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([intentId, row]) => ({
      intentId,
      orderCount: row.orderCount,
      attributedRevenue: round2(row.revenue),
      revenueSharePct: totalRevenue > 0 ? round2((row.revenue / totalRevenue) * 100) : 0,
      data_mode: "measured" as const,
    }));
}

// ---------------------------------------------------------------------------
// View 2: Demand Gap (traffic × intents — estimated D vs measured T).
// ---------------------------------------------------------------------------

/** Demand Gap bucket per the testing plan: Revenue Expansion ≥50%, Market Expansion 30–49%. */
export const DEMAND_GAP_BUCKETS = [
  "revenue_expansion",
  "market_expansion",
  "healthy",
  "not_measured",
] as const;
export type DemandGapBucket = (typeof DEMAND_GAP_BUCKETS)[number];

export interface DemandGapRow {
  intentId: string;
  /** Estimated market demand (D) — null and labeled when not_measured. */
  demand: number | null;
  demandSource: string | null;
  /** Measured sessions that landed on this intent (T). */
  traffic: number;
  /** Coverage = T / D, 0–∞. Null when D is not_measured. */
  coverage: number | null;
  /** Gap share = (1 − coverage) × 100. Null when D is not_measured. */
  gapPct: number | null;
  bucket: DemandGapBucket;
  data_mode: "estimated";
}

/**
 * Demand Gap: where estimated market demand has no matching measured
 * traffic. Buckets: gap ≥ 50% → revenue_expansion; 30% ≤ gap < 50% →
 * market_expansion; below 30% → healthy. A not_measured demand estimate
 * yields bucket "not_measured" with null numbers — never a fabricated D.
 */
export function demandGap(
  sessions: AttributionSession[],
  demandEstimates: DemandEstimate[],
): DemandGapRow[] {
  for (const estimate of demandEstimates) {
    if (estimate.measurementStatus === "not_measured" && estimate.demand !== null) {
      throw new AttributionInputError(
        `demand estimate for ${estimate.intentId} is not_measured but carries a demand value — not_measured stays not_measured (no invented volumes)`,
      );
    }
    if (estimate.measurementStatus !== "not_measured" && !estimate.source) {
      throw new AttributionInputError(
        `demand estimate for ${estimate.intentId} must name its source (provenance)`,
      );
    }
  }

  const trafficByIntent = new Map<string, number>();
  for (const session of sessions) {
    if (session.landedIntentId === null) continue;
    trafficByIntent.set(
      session.landedIntentId,
      (trafficByIntent.get(session.landedIntentId) ?? 0) + 1,
    );
  }

  return demandEstimates
    .map((estimate): DemandGapRow => {
      const traffic = trafficByIntent.get(estimate.intentId) ?? 0;
      if (estimate.measurementStatus === "not_measured" || estimate.demand === null) {
        return {
          intentId: estimate.intentId,
          demand: null,
          demandSource: null,
          traffic,
          coverage: null,
          gapPct: null,
          bucket: "not_measured",
          data_mode: "estimated",
        };
      }
      if (estimate.demand < 0) {
        throw new AttributionInputError(
          `demand estimate for ${estimate.intentId} cannot be negative`,
        );
      }
      const coverage = estimate.demand > 0 ? traffic / estimate.demand : null;
      const gapPct = coverage !== null ? round2((1 - coverage) * 100) : null;
      return {
        intentId: estimate.intentId,
        demand: estimate.demand,
        demandSource: estimate.source,
        traffic,
        coverage: coverage !== null ? round2(coverage * 100) / 100 : null,
        gapPct,
        bucket: classifyGap(gapPct),
        data_mode: "estimated",
      };
    })
    .sort((a, b) => (a.intentId < b.intentId ? -1 : a.intentId > b.intentId ? 1 : 0));
}

/** Bucket edges are inclusive on the boundary: gap of exactly 50 → revenue_expansion, exactly 30 → market_expansion. */
export function classifyGap(gapPct: number | null): DemandGapBucket {
  if (gapPct === null) return "not_measured";
  if (gapPct >= 50) return "revenue_expansion";
  if (gapPct >= 30) return "market_expansion";
  return "healthy";
}

// ---------------------------------------------------------------------------
// View 3: Channel Quality (traffic × orders — measured).
// ---------------------------------------------------------------------------

export interface ChannelQualityRow {
  channelGroup: string;
  sessions: number;
  orders: number;
  /** CVR = O / T, 0–100. Zero sessions → null (no denominator invented). */
  cvrPct: number | null;
  data_mode: "measured";
}

/**
 * Channel Quality: per channel group, does the traffic become orders.
 * A channel with sessions but no orders reports cvr 0 — a bare 0 must
 * carry its diagnosis (design §2.2), which is the caller's presentation
 * job; here 0 orders is the measured truth.
 */
export function channelQuality(
  orders: AttributionOrder[],
  sessions: AttributionSession[],
): ChannelQualityRow[] {
  const rows = new Map<string, { sessions: number; orders: number }>();
  for (const session of sessions) {
    const row = rows.get(session.channelGroup) ?? { sessions: 0, orders: 0 };
    row.sessions += 1;
    rows.set(session.channelGroup, row);
  }
  for (const order of orders) {
    const channel = order.attribution.channel_group;
    const row = rows.get(channel) ?? { sessions: 0, orders: 0 };
    row.orders += 1;
    rows.set(channel, row);
  }

  return [...rows.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([channelGroup, row]): ChannelQualityRow => {
      const cvrPct = row.sessions > 0 ? round2((row.orders / row.sessions) * 100) : null;
      return { channelGroup, sessions: row.sessions, orders: row.orders, cvrPct, data_mode: "measured" };
    });
}

// ---------------------------------------------------------------------------
// Per-intent D→T→O funnel and Opportunity Score.
// ---------------------------------------------------------------------------

export interface FunnelStage {
  intentId: string;
  /** D — estimated market demand (null when not_measured, labeled estimated). */
  demand: number | null;
  /** T — measured sessions. */
  traffic: number;
  /** O — measured attributed orders. */
  orders: number;
  coverage: number | null;
  cvrPct: number | null;
}

/**
 * The per-intent three-stage funnel D → T → O (design §1.8). D is
 * estimated and labeled; T and O are measured.
 */
export function intentFunnel(
  orders: AttributionOrder[],
  sessions: AttributionSession[],
  visits: AttributionVisit[],
  demandEstimates: DemandEstimate[],
): FunnelStage[] {
  const assignment = attributeOrdersToIntents(orders, sessions, visits);
  const ordersByIntent = new Map<string, number>();
  for (const order of orders) {
    const intentId = assignment.get(order.orderId) ?? null;
    if (intentId === null) continue;
    ordersByIntent.set(intentId, (ordersByIntent.get(intentId) ?? 0) + 1);
  }

  const gaps = demandGap(sessions, demandEstimates);
  return gaps.map((gap) => {
    const orders = ordersByIntent.get(gap.intentId) ?? 0;
    return {
      intentId: gap.intentId,
      demand: gap.demand,
      traffic: gap.traffic,
      orders,
      coverage: gap.coverage,
      cvrPct: gap.traffic > 0 ? round2((orders / gap.traffic) * 100) : null,
    };
  });
}

export interface OpportunityScoreRow {
  intentId: string;
  /** (D − T) × baseline CVR × AOV — always an estimate. */
  score: number | null;
  /** Always true when score is a number; the UI renders the estimated badge from this. */
  estimated: true;
  inputs: {
    demand: number;
    traffic: number;
    baselineCvrPct: number;
    aov: number;
  };
  baselineCvrSource: string;
}

/**
 * Opportunity Score: expected incremental revenue per intent, (D − T) ×
 * baseline CVR × AOV (design §1.8, 估计级). Requires a demand estimate, a
 * named baseline-CVR source, and a measured average order value from the
 * ledger. Intents without a measurable D score null — never a fabricated
 * opportunity. Output is sorted score-desc (tie-break intentId asc) for
 * deterministic P0/P1/P2 ordering.
 */
export function opportunityScores(
  orders: AttributionOrder[],
  sessions: AttributionSession[],
  visits: AttributionVisit[],
  demandEstimates: DemandEstimate[],
  input: { baselineCvrPct: number; baselineCvrSource: string },
): OpportunityScoreRow[] {
  if (!Number.isFinite(input.baselineCvrPct) || input.baselineCvrPct <= 0) {
    throw new AttributionInputError("baseline CVR must be a positive percentage");
  }
  if (!input.baselineCvrSource) {
    throw new AttributionInputError("baseline CVR must name its source (provenance)");
  }

  const attributedOrders = orders.filter((o) => {
    const intentId = attributeOrdersToIntents([o], sessions, visits).get(o.orderId) ?? null;
    return intentId !== null;
  });
  const aov =
    attributedOrders.length > 0
      ? attributedOrders.reduce((sum, o) => sum + o.netSales, 0) / attributedOrders.length
      : 0;

  return demandEstimates
    .map((estimate): OpportunityScoreRow => {
      const funnelRow = intentFunnel(orders, sessions, visits, [estimate])[0]!;
      if (estimate.measurementStatus === "not_measured" || funnelRow.demand === null) {
        return {
          intentId: estimate.intentId,
          score: null,
          estimated: true,
          inputs: { demand: 0, traffic: funnelRow.traffic, baselineCvrPct: input.baselineCvrPct, aov: round2(aov) },
          baselineCvrSource: input.baselineCvrSource,
        };
      }
      const score = round2(
        (funnelRow.demand - funnelRow.traffic) *
          (input.baselineCvrPct / 100) *
          (aov > 0 ? aov : 0),
      );
      return {
        intentId: estimate.intentId,
        score,
        estimated: true,
        inputs: {
          demand: funnelRow.demand,
          traffic: funnelRow.traffic,
          baselineCvrPct: input.baselineCvrPct,
          aov: round2(aov),
        },
        baselineCvrSource: input.baselineCvrSource,
      };
    })
    .sort((a, b) => {
      if (a.score !== null && b.score !== null && a.score !== b.score) {
        return b.score - a.score;
      }
      if ((a.score === null) !== (b.score === null)) {
        return a.score === null ? 1 : -1;
      }
      return a.intentId < b.intentId ? -1 : a.intentId > b.intentId ? 1 : 0;
    });
}
