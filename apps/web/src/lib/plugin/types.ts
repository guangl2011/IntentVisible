/**
 * Wire shapes of the plugin Phase I read surface (apps/api/src/plugin/
 * compute.ts is the source of truth — these mirror its exported payload
 * types, since web must not import from the api app). If the API payloads
 * change, these types and the component tests are the net that catches it.
 */

export type RunDataMode = "llm_simulated" | "provider_measured";

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

export interface PromptRef {
  prompt_text: string;
  is_primary: boolean;
}

/**
 * Provenance-carrying visibility. A missing snapshot row normalizes to
 * not_measured server-side; the UI renders that as its own state and never
 * fills a number in.
 */
export interface VisibilityProvenance {
  measurement_status: "not_measured" | "imported" | "measured";
  measurement_kind: "rolling" | "single_day" | null;
  source_engines: string[] | null;
  measurement_window_start: string | null;
  measurement_window_end: string | null;
  visibility_pct: number | null;
  measurement_source: string | null;
}

export interface BuyerIntentPayload {
  intent_id: string;
  intent_version: number;
  scope: "brand" | "product";
  intent_name: string;
  buyer_stage: string;
  intent_category: string;
  persona: string;
  pain_point: string;
  status: "draft" | "pending_review" | "active";
  confidence: "low" | "medium" | "high";
  evidence_urls: string[];
  prompts: PromptRef[];
  visibility: VisibilityProvenance;
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
  sessions: number | null;
  cvr: number | null;
}

export interface FunnelRow {
  intent_id: string;
  demand: { tier: "low" | "medium" | "high"; basis: "llm_estimated" } | { tier: null; basis: "not_measured" };
  traffic_sessions: number;
  attributed_orders: number;
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
  entry: CommissionEntryAmount;
}

export interface CommissionEntryAmount {
  entry_type: "commission" | "refund_offset";
  amount: number;
  status: "pending" | "confirmed" | "refunded";
  base_amount?: number;
}

export interface PerOrderReconciliation {
  order_id: string;
  order_number: string;
  gross_commission: number;
  refund_offsets: number;
  net_commission: number;
  status: "pending" | "confirmed" | "refunded";
}

export interface CommissionLedgerPayload {
  entries: CommissionEntryView[];
  per_order: PerOrderReconciliation[];
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
