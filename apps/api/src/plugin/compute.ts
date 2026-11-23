/**
 * Pure derivations behind the plugin Phase I endpoints (design v1.4 §1.8,
 * §2). No I/O, no clocks, no randomness: rows in, payloads out — the same
 * inputs always produce deep-equal outputs (testing plan Layer 4:
 * deterministic recomputation).
 *
 * Red lines encoded here, not assumed of the caller:
 * - Demand stays tier-only (`llm_estimated`) — no invented search volumes,
 *   so numeric D→T coverage is withheld rather than fabricated.
 * - Opportunity scores are `estimated` derivations over measured-side
 *   inputs, never presented as ledger facts.
 * - Settlement is computed only over `provider_measured` data; fixture
 *   (llm_simulated) data gets a typed withheld state.
 */

import type {
  AffiliateVisitRow,
  AiReferralSessionRow,
  CommissionRow,
  IntentUnitRow,
  OrderRow,
} from "./store.js";
import type { RunDataMode } from "@intentvisible/core-schema";

export type AlertSeverity = "p0" | "p1" | "p2";

export type AlertReasonKind =
  | "first_intent_attributed_order"
  | "intent_pending_review"
  | "refund_offset_recorded"
  | "single_day_snapshot"
  | "visibility_not_measured";

export interface PluginAlert {
  alert_id: string;
  severity: AlertSeverity;
  reason_kind: AlertReasonKind;
  reason: string;
  intent_id?: string;
  order_id?: string;
}

export interface IntentHealthComponent {
  key: string;
  label: string;
  score: number;
  detail: string;
}

export interface IntentHealthScore {
  kind: "heuristic";
  score: number;
  note: string;
  components: IntentHealthComponent[];
}

export interface OverviewPayload {
  shop_id: string;
  as_of: string;
  todays_alerts: PluginAlert[];
  agentic_store_summary: {
    summary_text: string;
    key_numbers: {
      active_intent_count: number;
      persona_count: number;
      ai_referral_sessions_7d: number;
    };
    provenance: {
      generated_by: string;
      data_window_start: string;
      data_window_end: string;
    };
  };
  intent_health_score: IntentHealthScore;
}

export interface BuyerIntentPayload {
  intent_id: string;
  intent_version: number;
  scope: "brand" | "product";
  intent_name: string;
  buyer_stage: IntentUnitRow["buyer_stage"];
  intent_category: IntentUnitRow["intent_category"];
  persona: string;
  pain_point: string;
  status: IntentUnitRow["status"];
  confidence: IntentUnitRow["confidence"];
  evidence_urls: string[];
  prompts: IntentUnitRow["prompts"];
  /** Provenance-carrying visibility; missing rows normalize to not_measured. */
  visibility: NonNullable<IntentUnitRow["visibility"]>;
}

export type DemandGapBucket = "revenue_expansion" | "market_expansion" | "healthy" | "not_measured";

export interface IntentYieldRow {
  intent_id: string;
  intent_name: string;
  orders: number;
  gross_sales: number;
  refunded_sales: number;
  net_sales: number;
  share_of_attributed_orders: number;
}

export interface DemandGapRow {
  intent_id: string;
  demand: { tier: "low" | "medium" | "high"; basis: "llm_estimated" } | { tier: null; basis: "not_measured" };
  visibility_pct: number | null;
  visibility_provenance: {
    measurement_kind: "rolling" | "single_day" | null;
    source_engines: string[] | null;
    window_start: string | null;
    window_end: string | null;
  } | null;
  gap_pct: number | null;
  bucket: DemandGapBucket;
}

export interface ChannelQualityRow {
  channel: string;
  orders: number;
  gross_sales: number;
  net_sales: number;
  /** null when the channel has no session instrumentation in this data. */
  sessions: number | null;
  cvr: number | null;
}

export interface FunnelRow {
  intent_id: string;
  demand: { tier: "low" | "medium" | "high"; basis: "llm_estimated" } | { tier: null; basis: "not_measured" };
  traffic_sessions: number;
  attributed_orders: number;
  /** Numeric coverage needs a numeric D; tier-only demand withholds it. */
  coverage: null;
  coverage_note: string;
}

export interface OpportunityScoreRow {
  intent_id: string;
  score: number | null;
  basis: "estimated";
  formula: string;
  note: string | null;
}

export interface AttributionPayload {
  intent_yield: IntentYieldRow[];
  demand_gap: DemandGapRow[];
  channel_quality: ChannelQualityRow[];
  funnel: FunnelRow[];
  opportunity_scores: OpportunityScoreRow[];
}

export interface CommissionEntryView {
  entry_id: number;
  order_id: string;
  order_number: string;
  intent_id: string | null;
  channel: string;
  tracking_code: string | null;
  billed_period_start: string;
  billed_period_end: string;
  entry: CommissionRow["entry"];
}

export interface PerOrderReconciliation {
  order_id: string;
  order_number: string;
  gross_commission: number;
  /** Negative — refund offsets are credits back, never destructive edits. */
  refund_offsets: number;
  net_commission: number;
  status: "pending" | "confirmed" | "refunded";
}

export interface CommissionLedgerPayload {
  entries: CommissionEntryView[];
  per_order: PerOrderReconciliation[];
  /** Orders that are deliberately never billed (unattributed dark traffic). */
  unbilled_order_ids: string[];
  totals: { gross: number; refunds: number; net: number };
}

export interface AffiliateVisitView {
  visit_id: string;
  channel: string;
  partner: string;
  tracking_code: string;
  landed_intent_id: string | null;
  order_id: string | null;
  order_number: string | null;
  landed_at: string;
}

export interface MatchPayload {
  affiliate_visits: AffiliateVisitView[];
  by_channel: { channel: string; visits: number; orders: number }[];
  by_partner: { partner: string; visits: number; orders: number }[];
  settlement:
    | { status: "withheld"; reason: string }
    | { status: "available"; per_tracking_code: { tracking_code: string; gross: number; refunds: number; net: number }[] };
}

export interface AuditPayload {
  readiness: {
    kind: "heuristic";
    note: string;
    per_intent: { intent_id: string; state: "ready" | "needs_measurement" | "pending_review"; score: number }[];
  };
  recommendations: { intent_id: string; priority: AlertSeverity; recommendation: string }[];
  performance_billing: {
    track_a: {
      model: "order_attribution_commission";
      rate_band: { min: number; max: number };
      entries_count: number;
      gross: number;
      refunds: number;
      net: number;
    };
    track_b: { status: "phase_2_stub"; reason: string };
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Demand Gap buckets (testing plan: Revenue Expansion ≥50% / Market
 * Expansion 30–49% of unmet demand; below that the intent is healthy).
 * Exported for boundary testing.
 */
export function gapBucket(gapPct: number): Exclude<DemandGapBucket, "not_measured"> {
  if (gapPct >= 50) {
    return "revenue_expansion";
  }
  if (gapPct >= 30) {
    return "market_expansion";
  }
  return "healthy";
}

/** The explicit not_measured shape a missing snapshot row normalizes to. */
function notMeasuredVisibility(): NonNullable<IntentUnitRow["visibility"]> {
  return {
    measurement_status: "not_measured",
    measurement_kind: null,
    source_engines: null,
    measurement_window_start: null,
    measurement_window_end: null,
    visibility_pct: null,
    measurement_source: null,
  };
}

function coalesceVisibility(unit: IntentUnitRow): NonNullable<IntentUnitRow["visibility"]> {
  return unit.visibility ?? notMeasuredVisibility();
}

function severityRank(severity: AlertSeverity): number {
  return { p0: 0, p1: 1, p2: 2 }[severity];
}

/** Demand tier from the unit's own confidence — deterministic, tier-only, estimated. */
function demandTier(unit: IntentUnitRow): "low" | "medium" | "high" {
  return unit.confidence;
}

function dayWindowEnd(asOf: string): string {
  const end = new Date(`${asOf}T00:00:00Z`);
  end.setUTCHours(23, 59, 59, 999);
  return end.toISOString();
}

function dayWindowStart(asOf: string, daysBack: number): string {
  const start = new Date(`${asOf}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() - daysBack);
  return start.toISOString();
}

/** Overview payload: Today's Alerts, Agentic Store Summary, Intent Health Score. */
export function buildOverview(input: {
  shopId: string;
  units: IntentUnitRow[];
  sessions: AiReferralSessionRow[];
  orders: OrderRow[];
  commissions: CommissionRow[];
  asOf: string;
}): OverviewPayload {
  const { shopId, units, sessions, orders, commissions, asOf } = input;

  const alerts: PluginAlert[] = [];
  for (const unit of units) {
    const visibility = coalesceVisibility(unit);
    if (unit.status === "pending_review") {
      alerts.push({
        alert_id: `alert_intent_pending_review_${unit.intentId}`,
        severity: "p1",
        reason_kind: "intent_pending_review",
        reason: `Intent "${unit.intent_name}" is pending review and not yet active.`,
        intent_id: unit.intentId,
      });
    }
    if (visibility.measurement_status === "not_measured") {
      alerts.push({
        alert_id: `alert_visibility_not_measured_${unit.intentId}`,
        severity: "p2",
        reason_kind: "visibility_not_measured",
        reason: `Intent "${unit.intent_name}" has no visibility measurement yet — it shows as not measured, never an invented value.`,
        intent_id: unit.intentId,
      });
    } else if (visibility.measurement_kind === "single_day") {
      alerts.push({
        alert_id: `alert_single_day_snapshot_${unit.intentId}`,
        severity: "p2",
        reason_kind: "single_day_snapshot",
        reason: `Intent "${unit.intent_name}" visibility is a single-day snapshot (${visibility.measurement_window_start}); prefer a rolling window before treating it as steady state.`,
        intent_id: unit.intentId,
      });
    }
  }

  const firstAttributedOrder = orders.find(
    (order) => order.isFirstOrder && commissions.some((row) => row.orderId === order.orderId),
  );
  if (firstAttributedOrder) {
    alerts.push({
      alert_id: `alert_first_intent_attributed_order_${firstAttributedOrder.orderId}`,
      severity: "p1",
      reason_kind: "first_intent_attributed_order",
      reason: `First intent-attributed order ${firstAttributedOrder.orderNumber} landed (milestone).`,
      order_id: firstAttributedOrder.orderId,
    });
  }

  const refundedOrderIds = new Set(orders.filter((order) => order.refundedAt !== null).map((order) => order.orderId));
  for (const row of commissions) {
    if (row.entry.entry_type === "refund_offset" && refundedOrderIds.has(row.orderId)) {
      alerts.push({
        alert_id: `alert_refund_offset_recorded_${row.entryId}`,
        severity: "p1",
        reason_kind: "refund_offset_recorded",
        reason: `Refund recorded on order ${row.orderId}: commission offset by ${row.entry.amount} (ledger stays reconciled).`,
        order_id: row.orderId,
      });
    }
  }

  alerts.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || a.alert_id.localeCompare(b.alert_id));

  const windowStart = dayWindowStart(asOf, 6);
  const windowEnd = dayWindowEnd(asOf);
  const sessions7d = sessions.filter((s) => s.occurred_at >= windowStart && s.occurred_at <= windowEnd).length;

  const activeUnits = units.filter((unit) => unit.status === "active");
  const personas = new Set(units.map((unit) => unit.persona));

  const components: IntentHealthComponent[] = [
    {
      key: "intent_coverage",
      label: "Intent coverage",
      score: units.length === 0 ? 0 : round2((activeUnits.length / units.length) * 100),
      detail: `${activeUnits.length} of ${units.length} intent units active.`,
    },
    {
      key: "measurement_coverage",
      label: "Measurement coverage",
      score:
        units.length === 0
          ? 0
          : round2(
              (units.filter((unit) => coalesceVisibility(unit).measurement_status !== "not_measured").length /
                units.length) *
                100,
            ),
      detail: `${units.filter((unit) => coalesceVisibility(unit).measurement_status !== "not_measured").length} of ${units.length} units carry a visibility measurement.`,
    },
    {
      key: "attribution_health",
      label: "Attribution health",
      score:
        orders.length === 0
          ? 0
          : round2(
              (orders.filter((order) => order.attribution.attribution_basis !== "unattributed").length /
                orders.length) *
                100,
            ),
      detail: `${orders.filter((order) => order.attribution.attribution_basis !== "unattributed").length} of ${orders.length} orders carry an attribution basis.`,
    },
  ];

  const healthScore = round2(components.reduce((sum, c) => sum + c.score, 0) / components.length);

  return {
    shop_id: shopId,
    as_of: asOf,
    todays_alerts: alerts,
    agentic_store_summary: {
      summary_text: `${activeUnits.length} active intents across ${personas.size} personas; ${sessions7d} AI-referral sessions in the last 7 days (as of ${asOf}).`,
      key_numbers: {
        active_intent_count: activeUnits.length,
        persona_count: personas.size,
        ai_referral_sessions_7d: sessions7d,
      },
      provenance: {
        generated_by: "fixture-seed",
        data_window_start: windowStart.slice(0, 10),
        data_window_end: windowEnd.slice(0, 10),
      },
    },
    intent_health_score: {
      kind: "heuristic",
      score: healthScore,
      note: "Heuristic score over coverage components — not a conversion or revenue forecast.",
      components,
    },
  };
}

/** Buyer Intents list with provenance-carrying visibility. */
export function buildBuyerIntents(units: IntentUnitRow[]): BuyerIntentPayload[] {
  return units.map((unit) => ({
    intent_id: unit.intentId,
    intent_version: unit.intentVersion,
    scope: unit.scope,
    intent_name: unit.intent_name,
    buyer_stage: unit.buyer_stage,
    intent_category: unit.intent_category,
    persona: unit.persona,
    pain_point: unit.pain_point,
    status: unit.status,
    confidence: unit.confidence,
    evidence_urls: unit.evidence_urls,
    prompts: unit.prompts,
    visibility: coalesceVisibility(unit),
  }));
}

/** The attribution correlation model (§1.8): yield, demand gap, channel quality, funnel, opportunity. */
export function buildAttribution(input: {
  units: IntentUnitRow[];
  sessions: AiReferralSessionRow[];
  orders: OrderRow[];
  commissions: CommissionRow[];
}): AttributionPayload {
  const { units, sessions, orders, commissions } = input;

  const ordersById = new Map(orders.map((order) => [order.orderId, order]));

  // Intent → orders via the commission ledger (intent_id is on the entries).
  const ordersByIntent = new Map<string, string[]>();
  for (const row of commissions) {
    if (row.intentId === null || row.entry.entry_type !== "commission") {
      continue;
    }
    const list = ordersByIntent.get(row.intentId) ?? [];
    if (!list.includes(row.orderId)) {
      list.push(row.orderId);
    }
    ordersByIntent.set(row.intentId, list);
  }

  const totalAttributedOrders = [...ordersByIntent.values()].reduce((sum, list) => sum + list.length, 0);

  const intent_yield: IntentYieldRow[] = [];
  const demand_gap: DemandGapRow[] = [];
  const funnel: FunnelRow[] = [];
  const opportunity_scores: OpportunityScoreRow[] = [];

  for (const unit of units) {
    const intentOrders = (ordersByIntent.get(unit.intentId) ?? [])
      .map((orderId) => ordersById.get(orderId))
      .filter((order): order is OrderRow => order !== undefined);

    const gross = intentOrders.reduce((sum, order) => sum + order.netSales, 0);
    const refunded = intentOrders
      .filter((order) => order.refundedAt !== null)
      .reduce((sum, order) => sum + order.netSales, 0);

    intent_yield.push({
      intent_id: unit.intentId,
      intent_name: unit.intent_name,
      orders: intentOrders.length,
      gross_sales: round2(gross),
      refunded_sales: round2(refunded),
      net_sales: round2(gross - refunded),
      share_of_attributed_orders: totalAttributedOrders === 0 ? 0 : round2(intentOrders.length / totalAttributedOrders),
    });

    const visibility = coalesceVisibility(unit);
    const trafficSessions = sessions.filter((s) => s.landedIntentId === unit.intentId).length;

    if (visibility.measurement_status === "not_measured") {
      demand_gap.push({
        intent_id: unit.intentId,
        demand: { tier: null, basis: "not_measured" },
        visibility_pct: null,
        visibility_provenance: null,
        gap_pct: null,
        bucket: "not_measured",
      });
      funnel.push({
        intent_id: unit.intentId,
        demand: { tier: null, basis: "not_measured" },
        traffic_sessions: trafficSessions,
        attributed_orders: intentOrders.length,
        coverage: null,
        coverage_note:
          "Demand is not measured for this unit; no numeric coverage is computed rather than invented.",
      });
      opportunity_scores.push({
        intent_id: unit.intentId,
        score: null,
        basis: "estimated",
        formula: "gap_pct × gross attributed commission — not computable without a measurement",
        note: "Unit is not measured: opportunity score is withheld (null), never guessed.",
      });
    } else {
      const gapPct = round2(100 - (visibility.visibility_pct ?? 0));
      demand_gap.push({
        intent_id: unit.intentId,
        demand: { tier: demandTier(unit), basis: "llm_estimated" },
        visibility_pct: visibility.visibility_pct,
        visibility_provenance: {
          measurement_kind: visibility.measurement_kind,
          source_engines: visibility.source_engines,
          window_start: visibility.measurement_window_start,
          window_end: visibility.measurement_window_end,
        },
        gap_pct: gapPct,
        bucket: gapBucket(gapPct),
      });
      funnel.push({
        intent_id: unit.intentId,
        demand: { tier: demandTier(unit), basis: "llm_estimated" },
        traffic_sessions: trafficSessions,
        attributed_orders: intentOrders.length,
        coverage: null,
        coverage_note:
          "Demand is held tier-only (no invented search volumes); numeric coverage is withheld rather than fabricated.",
      });
      const grossCommission = commissions
        .filter((row) => row.intentId === unit.intentId && row.entry.entry_type === "commission")
        .reduce((sum, row) => sum + row.entry.base_amount, 0);
      opportunity_scores.push({
        intent_id: unit.intentId,
        score: round2((gapPct / 100) * grossCommission),
        basis: "estimated",
        formula: "gap_pct × gross attributed commission (estimated)",
        note: null,
      });
    }
  }

  // Channel quality: orders grouped by ledger channel_group; sessions only
  // where the fixture instruments them (AI-referral sessions).
  const channels = [...new Set(orders.map((order) => order.attribution.channel_group))];
  const channel_quality: ChannelQualityRow[] = channels.map((channel) => {
    const channelOrders = orders.filter((order) => order.attribution.channel_group === channel);
    const gross = channelOrders.reduce((sum, order) => sum + order.netSales, 0);
    const refunded = channelOrders
      .filter((order) => order.refundedAt !== null)
      .reduce((sum, order) => sum + order.netSales, 0);
    const channelSessions = channel === "ai_referral" ? sessions.length : null;
    return {
      channel,
      orders: channelOrders.length,
      gross_sales: round2(gross),
      net_sales: round2(gross - refunded),
      sessions: channelSessions,
      cvr: channelSessions === null || channelSessions === 0 ? null : round2(channelOrders.length / channelSessions),
    };
  });

  return { intent_yield, demand_gap, channel_quality, funnel, opportunity_scores };
}

/** Commission ledger read: entries plus per-order gross → refunds → net reconciliation. */
export function buildCommissionLedger(input: {
  orders: OrderRow[];
  commissions: CommissionRow[];
}): CommissionLedgerPayload {
  const { orders, commissions } = input;
  const ordersById = new Map(orders.map((order) => [order.orderId, order]));

  const entries: CommissionEntryView[] = commissions.map((row) => {
    const order = ordersById.get(row.orderId);
    return {
      entry_id: row.entryId,
      order_id: row.orderId,
      order_number: order?.orderNumber ?? row.orderId,
      intent_id: row.intentId,
      channel: row.channel,
      tracking_code: row.trackingCode,
      billed_period_start: row.billedPeriodStart,
      billed_period_end: row.billedPeriodEnd,
      entry: row.entry,
    };
  });

  const perOrderIds = [...new Set(commissions.map((row) => row.orderId))];
  const per_order: PerOrderReconciliation[] = perOrderIds.map((orderId) => {
    const rows = commissions.filter((row) => row.orderId === orderId);
    const gross = rows
      .filter((row) => row.entry.entry_type === "commission")
      .reduce((sum, row) => sum + row.entry.amount, 0);
    const refunds = rows
      .filter((row) => row.entry.entry_type === "refund_offset")
      .reduce((sum, row) => sum + row.entry.amount, 0);
    return {
      order_id: orderId,
      order_number: ordersById.get(orderId)?.orderNumber ?? orderId,
      gross_commission: round2(gross),
      refund_offsets: round2(refunds),
      net_commission: round2(gross + refunds),
      status: refunds < 0 ? "refunded" : (rows.find((row) => row.entry.entry_type === "commission")?.entry.status ?? "pending"),
    };
  });

  const gross = per_order.reduce((sum, row) => sum + row.gross_commission, 0);
  const refunds = per_order.reduce((sum, row) => sum + row.refund_offsets, 0);
  const billedOrderIds = new Set(perOrderIds);
  const unbilled = orders.filter((order) => !billedOrderIds.has(order.orderId));

  return {
    entries,
    per_order,
    unbilled_order_ids: unbilled.filter((order) => order.attribution.attribution_basis === "unattributed").map((order) => order.orderId),
    totals: { gross: round2(gross), refunds: round2(refunds), net: round2(gross + refunds) },
  };
}

/** Intent Match read: affiliate visits, channel/partner views, settlement gate. */
export function buildMatchView(input: {
  visits: AffiliateVisitRow[];
  orders: OrderRow[];
  commissions: CommissionRow[];
  dataMode: RunDataMode;
}): MatchPayload {
  const { visits, orders, commissions, dataMode } = input;
  const ordersById = new Map(orders.map((order) => [order.orderId, order]));

  const affiliate_visits: AffiliateVisitView[] = visits.map((visit) => ({
    visit_id: visit.visit_id,
    channel: visit.channel,
    partner: visit.partner,
    tracking_code: visit.tracking_code,
    landed_intent_id: visit.landed_intent_id,
    order_id: visit.orderId,
    order_number: visit.orderId ? (ordersById.get(visit.orderId)?.orderNumber ?? null) : null,
    landed_at: visit.landed_at,
  }));

  const countBy = (key: "channel" | "partner"): { key: string; visits: number; orders: number }[] => {
    const keys = [...new Set(visits.map((visit) => visit[key]))];
    return keys.map((k) => {
      const rows = visits.filter((visit) => visit[key] === k);
      return { key: k, visits: rows.length, orders: rows.filter((visit) => visit.orderId !== null).length };
    });
  };

  let settlement: MatchPayload["settlement"];
  if (dataMode !== "provider_measured") {
    settlement = {
      status: "withheld",
      reason:
        "Settlement computes only over provider_measured data; this response is llm_simulated fixture data, so no settlement is derived from it.",
    };
  } else {
    const codes = [...new Set(commissions.filter((row) => row.trackingCode !== null).map((row) => row.trackingCode as string))];
    settlement = {
      status: "available",
      per_tracking_code: codes.map((code) => {
        const rows = commissions.filter((row) => row.trackingCode === code);
        const gross = rows.filter((r) => r.entry.entry_type === "commission").reduce((sum, r) => sum + r.entry.amount, 0);
        const refunds = rows.filter((r) => r.entry.entry_type === "refund_offset").reduce((sum, r) => sum + r.entry.amount, 0);
        return { tracking_code: code, gross: round2(gross), refunds: round2(refunds), net: round2(gross + refunds) };
      }),
    };
  }

  return {
    affiliate_visits,
    by_channel: countBy("channel").map(({ key, visits: v, orders: o }) => ({ channel: key, visits: v, orders: o })),
    by_partner: countBy("partner").map(({ key, visits: v, orders: o }) => ({ partner: key, visits: v, orders: o })),
    settlement,
  };
}

/** Intent Audit read: heuristic readiness, intent-referencing recommendations, performance billing. */
export function buildAudit(input: { units: IntentUnitRow[]; commissions: CommissionRow[] }): AuditPayload {
  const { units, commissions } = input;

  const per_intent = units.map((unit) => {
    const visibility = coalesceVisibility(unit);
    if (unit.status === "pending_review") {
      return { intent_id: unit.intentId, state: "pending_review" as const, score: 0 };
    }
    if (visibility.measurement_status === "not_measured") {
      return { intent_id: unit.intentId, state: "needs_measurement" as const, score: 25 };
    }
    return {
      intent_id: unit.intentId,
      state: "ready" as const,
      score: visibility.measurement_kind === "rolling" ? 100 : 50,
    };
  });

  const recommendations: AuditPayload["recommendations"] = [];
  for (const unit of units) {
    const visibility = coalesceVisibility(unit);
    if (unit.status === "pending_review") {
      recommendations.push({
        intent_id: unit.intentId,
        priority: "p1",
        recommendation: `Review and activate "${unit.intent_name}" — it is pending review and excluded from active coverage.`,
      });
    }
    if (visibility.measurement_status === "not_measured") {
      recommendations.push({
        intent_id: unit.intentId,
        priority: "p1",
        recommendation: `Schedule visibility monitoring for "${unit.intent_name}" — it is currently not measured.`,
      });
    } else if (visibility.measurement_kind === "single_day") {
      recommendations.push({
        intent_id: unit.intentId,
        priority: "p2",
        recommendation: `Re-measure "${unit.intent_name}" with a rolling window — its current visibility is a single-day snapshot.`,
      });
    }
  }
  recommendations.sort((a, b) => severityRank(a.priority) - severityRank(b.priority) || a.intent_id.localeCompare(b.intent_id));

  const commissionRows = commissions.filter((row) => row.entry.entry_type === "commission");
  const gross = commissionRows.reduce((sum, row) => sum + row.entry.amount, 0);
  const refunds = commissions
    .filter((row) => row.entry.entry_type === "refund_offset")
    .reduce((sum, row) => sum + row.entry.amount, 0);

  return {
    readiness: {
      kind: "heuristic",
      note: "Heuristic readiness from review state and measurement shape — not a guarantee of performance.",
      per_intent,
    },
    recommendations,
    performance_billing: {
      track_a: {
        model: "order_attribution_commission",
        rate_band: { min: 0.05, max: 0.2 },
        entries_count: commissionRows.length,
        gross: round2(gross),
        refunds: round2(refunds),
        net: round2(gross + refunds),
      },
      track_b: {
        status: "phase_2_stub",
        reason: "Track B (ad-optimization performance fees) bills only after verified baselines exist; it is a Phase II stub and carries no entries.",
      },
    },
  };
}
