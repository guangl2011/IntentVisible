import type {
  AttributionPayload,
  AuditPayload,
  BuyerIntentPayload,
  CommissionLedgerPayload,
  MatchPayload,
  OverviewPayload,
  VisibilityProvenance,
} from "../src/lib/plugin/types";

/**
 * Wire-shape fixtures for the plugin pages, mirroring the shapes the
 * plugin API's compute layer serves (apps/api/src/plugin/compute.ts) and
 * the deterministic demo seed (plugin-schema seed.ts: one rolling
 * measurement, one single-day snapshot, one not-measured unit).
 */

export const VISIBILITY_ROLLING: VisibilityProvenance = {
  measurement_status: "measured",
  measurement_kind: "rolling",
  source_engines: ["chatgpt.com", "perplexity"],
  measurement_window_start: "2026-11-16",
  measurement_window_end: "2026-11-22",
  visibility_pct: 41.2,
  measurement_source: "intentvisible-monitor",
};

export const VISIBILITY_SINGLE_DAY: VisibilityProvenance = {
  measurement_status: "measured",
  measurement_kind: "single_day",
  source_engines: ["chatgpt.com"],
  measurement_window_start: "2026-11-22",
  measurement_window_end: "2026-11-22",
  visibility_pct: 12.8,
  measurement_source: "intentvisible-monitor",
};

export const VISIBILITY_NOT_MEASURED: VisibilityProvenance = {
  measurement_status: "not_measured",
  measurement_kind: null,
  source_engines: null,
  measurement_window_start: null,
  measurement_window_end: null,
  visibility_pct: null,
  measurement_source: null,
};

export const BUYER_INTENTS: BuyerIntentPayload[] = [
  {
    intent_id: "intent_s2000_vs_rivals",
    intent_version: 1,
    scope: "product",
    intent_name: "S2000 vs rival power stations",
    buyer_stage: "Comparison",
    intent_category: "Comparison",
    persona: "Overlanding weekend planner",
    pain_point: "Cannot tell whether S2000 outlasts a competitor's unit on a 3-day trip",
    status: "active",
    confidence: "high",
    evidence_urls: ["https://solix-demo.example.com/products/s2000"],
    prompts: [
      { prompt_text: "S2000 vs EcoFlow River 3 which lasts longer camping", is_primary: true },
      { prompt_text: "best 2000w power station comparison for overlanding", is_primary: false },
    ],
    visibility: VISIBILITY_ROLLING,
  },
  {
    intent_id: "intent_how_long_fridge",
    intent_version: 1,
    scope: "product",
    intent_name: "How long the S2000 runs a 12V fridge",
    buyer_stage: "Solution Research",
    intent_category: "Feature",
    persona: "Van-life weekend cook",
    pain_point: "Needs runtime math for a 12V fridge before trusting the spec sheet",
    status: "active",
    confidence: "medium",
    evidence_urls: ["https://solix-demo.example.com/products/s2000#runtime"],
    prompts: [{ prompt_text: "how long will a power station run a 12v fridge", is_primary: true }],
    visibility: VISIBILITY_SINGLE_DAY,
  },
  {
    intent_id: "intent_solar_sizing",
    intent_version: 1,
    scope: "brand",
    intent_name: "Solar panel sizing for S2000",
    buyer_stage: "Solution Research",
    intent_category: "Compatibility",
    persona: "Off-grid cabin owner",
    pain_point: "Unsure which panel wattage recharges the S2000 in a day",
    status: "pending_review",
    confidence: "low",
    evidence_urls: ["https://solix-demo.example.com/pages/solar-guide"],
    prompts: [{ prompt_text: "what watt solar panel charges a s2000 in one day", is_primary: true }],
    visibility: VISIBILITY_NOT_MEASURED,
  },
];

export const OVERVIEW: OverviewPayload = {
  shop_id: "shop_solix_demo",
  as_of: "2026-11-22",
  todays_alerts: [
    {
      alert_id: "alert_intent_pending_review_intent_solar_sizing",
      severity: "p1",
      reason_kind: "intent_pending_review",
      reason: 'Intent "Solar panel sizing for S2000" is pending review and not yet active.',
      intent_id: "intent_solar_sizing",
    },
    {
      alert_id: "alert_single_day_snapshot_intent_how_long_fridge",
      severity: "p2",
      reason_kind: "single_day_snapshot",
      reason: 'Intent "How long the S2000 runs a 12V fridge" visibility is a single-day snapshot (2026-11-22); prefer a rolling window before treating it as steady state.',
      intent_id: "intent_how_long_fridge",
    },
  ],
  agentic_store_summary: {
    summary_text: "3 active intents across 4 personas; 3 AI-referral sessions in the last 7 days (as of 2026-11-22).",
    key_numbers: { active_intent_count: 3, persona_count: 4, ai_referral_sessions_7d: 3 },
    provenance: {
      generated_by: "fixture-seed",
      data_window_start: "2026-11-16",
      data_window_end: "2026-11-22",
    },
  },
  intent_health_score: {
    kind: "heuristic",
    score: 58.33,
    note: "Heuristic score over coverage components — not a conversion or revenue forecast.",
    components: [
      { key: "intent_coverage", label: "Intent coverage", score: 75, detail: "3 of 4 intent units active." },
      {
        key: "measurement_coverage",
        label: "Measurement coverage",
        score: 75,
        detail: "3 of 4 units carry a visibility measurement.",
      },
      { key: "attribution_health", label: "Attribution health", score: 25, detail: "1 of 4 orders carry an attribution basis." },
    ],
  },
};

export const ATTRIBUTION: AttributionPayload = {
  intent_yield: [
    {
      intent_id: "intent_s2000_vs_rivals",
      intent_name: "S2000 vs rival power stations",
      orders: 2,
      gross_sales: 518.0,
      refunded_sales: 259.0,
      net_sales: 259.0,
      share_of_attributed_orders: 0.5,
    },
  ],
  demand_gap: [
    {
      intent_id: "intent_s2000_vs_rivals",
      demand: { tier: "high", basis: "llm_estimated" },
      visibility_pct: 41.2,
      visibility_provenance: {
        measurement_kind: "rolling",
        source_engines: ["chatgpt.com", "perplexity"],
        window_start: "2026-11-16",
        window_end: "2026-11-22",
      },
      gap_pct: 58.8,
      bucket: "revenue_expansion",
    },
    {
      intent_id: "intent_camping_power_rec",
      demand: { tier: "medium", basis: "llm_estimated" },
      visibility_pct: 27.5,
      visibility_provenance: {
        measurement_kind: "rolling",
        source_engines: ["chatgpt.com", "gemini", "perplexity"],
        window_start: "2026-11-09",
        window_end: "2026-11-22",
      },
      gap_pct: 72.5,
      bucket: "revenue_expansion",
    },
    {
      intent_id: "intent_how_long_fridge",
      demand: { tier: "medium", basis: "llm_estimated" },
      visibility_pct: 12.8,
      visibility_provenance: {
        measurement_kind: "single_day",
        source_engines: ["chatgpt.com"],
        window_start: "2026-11-22",
        window_end: "2026-11-22",
      },
      gap_pct: 87.2,
      bucket: "revenue_expansion",
    },
    {
      intent_id: "intent_solar_sizing",
      demand: { tier: null, basis: "not_measured" },
      visibility_pct: null,
      visibility_provenance: null,
      gap_pct: null,
      bucket: "not_measured",
    },
  ],
  channel_quality: [
    { channel: "ai_referral", orders: 2, gross_sales: 518, net_sales: 259, sessions: 3, cvr: 0.67 },
    { channel: "direct", orders: 1, gross_sales: 89, net_sales: 89, sessions: null, cvr: null },
  ],
  funnel: [
    {
      intent_id: "intent_s2000_vs_rivals",
      demand: { tier: "high", basis: "llm_estimated" },
      traffic_sessions: 1,
      attributed_orders: 1,
      coverage: null,
      coverage_note:
        "Demand is held tier-only (no invented search volumes); numeric coverage is withheld rather than fabricated.",
    },
    {
      intent_id: "intent_solar_sizing",
      demand: { tier: null, basis: "not_measured" },
      traffic_sessions: 0,
      attributed_orders: 0,
      coverage: null,
      coverage_note: "Demand is not measured for this unit; no numeric coverage is computed rather than invented.",
    },
  ],
  opportunity_scores: [
    {
      intent_id: "intent_s2000_vs_rivals",
      score: 41.5,
      basis: "estimated",
      formula: "gap_pct × gross attributed commission (estimated)",
      note: null,
    },
    {
      intent_id: "intent_solar_sizing",
      score: null,
      basis: "estimated",
      formula: "gap_pct × gross attributed commission — not computable without a measurement",
      note: "Unit is not measured: opportunity score is withheld (null), never guessed.",
    },
  ],
};

export const AUDIT: AuditPayload = {
  readiness: {
    kind: "heuristic",
    note: "Heuristic readiness from review state and measurement shape — not a guarantee of performance.",
    per_intent: [
      { intent_id: "intent_s2000_vs_rivals", state: "ready", score: 100 },
      { intent_id: "intent_how_long_fridge", state: "ready", score: 50 },
      { intent_id: "intent_solar_sizing", state: "pending_review", score: 0 },
    ],
  },
  recommendations: [
    {
      intent_id: "intent_solar_sizing",
      priority: "p1",
      recommendation: 'Review and activate "Solar panel sizing for S2000" — it is pending review and excluded from active coverage.',
    },
    {
      intent_id: "intent_how_long_fridge",
      priority: "p2",
      recommendation: 'Re-measure "How long the S2000 runs a 12V fridge" with a rolling window — its current visibility is a single-day snapshot.',
    },
  ],
  performance_billing: {
    track_a: {
      model: "order_attribution_commission",
      rate_band: { min: 0.05, max: 0.2 },
      entries_count: 3,
      gross: 38.63,
      refunds: -19.31,
      net: 19.32,
    },
    track_b: {
      status: "phase_2_stub",
      reason:
        "Track B (ad-optimization performance fees) bills only after verified baselines exist; it is a Phase II stub and carries no entries.",
    },
  },
};

export const MATCH_WITHHELD: MatchPayload = {
  affiliate_visits: [
    {
      visit_id: "visit_play_001",
      channel: "play",
      partner: "ai-catalog-weekly",
      tracking_code: "TID-PLAY-001",
      landed_intent_id: "intent_s2000_vs_rivals",
      order_id: "order_1001",
      order_number: "#1001",
      landed_at: "2026-11-20T15:05:00Z",
    },
    {
      visit_id: "visit_play_002",
      channel: "play",
      partner: "ai-catalog-weekly",
      tracking_code: "TID-PLAY-002",
      landed_intent_id: "intent_how_long_fridge",
      order_id: null,
      order_number: null,
      landed_at: "2026-11-21T09:40:00Z",
    },
  ],
  by_channel: [{ channel: "play", visits: 2, orders: 1 }],
  by_partner: [{ partner: "ai-catalog-weekly", visits: 2, orders: 1 }],
  settlement: {
    status: "withheld",
    reason:
      "Settlement computes only over provider_measured data; this response is llm_simulated fixture data, so no settlement is derived from it.",
  },
};

export const MATCH_SETTLED: MatchPayload = {
  ...MATCH_WITHHELD,
  settlement: {
    status: "available",
    per_tracking_code: [{ tracking_code: "TID-PLAY-001", gross: 19.31, refunds: -9.66, net: 9.65 }],
  },
};

export const COMMISSION: CommissionLedgerPayload = {
  entries: [
    {
      entry_id: 1,
      order_id: "order_1001",
      order_number: "#1001",
      intent_id: "intent_s2000_vs_rivals",
      channel: "play",
      tracking_code: "TID-PLAY-001",
      billed_period_start: "2026-11-20",
      billed_period_end: "2026-11-20",
      entry: { entry_type: "commission", amount: 19.31, status: "confirmed", base_amount: 259 },
    },
    {
      entry_id: 2,
      order_id: "order_1001",
      order_number: "#1001",
      intent_id: "intent_s2000_vs_rivals",
      channel: "play",
      tracking_code: "TID-PLAY-001",
      billed_period_start: "2026-11-21",
      billed_period_end: "2026-11-21",
      entry: { entry_type: "refund_offset", amount: -19.31, status: "refunded", base_amount: 259 },
    },
    {
      entry_id: 3,
      order_id: "order_1002",
      order_number: "#1002",
      intent_id: "intent_how_long_fridge",
      channel: "direct",
      tracking_code: null,
      billed_period_start: "2026-11-21",
      billed_period_end: "2026-11-21",
      entry: { entry_type: "commission", amount: 19.32, status: "pending", base_amount: 258.9 },
    },
  ],
  per_order: [
    {
      order_id: "order_1001",
      order_number: "#1001",
      gross_commission: 19.31,
      refund_offsets: -19.31,
      net_commission: 0,
      status: "refunded",
    },
    {
      order_id: "order_1002",
      order_number: "#1002",
      gross_commission: 19.32,
      refund_offsets: 0,
      net_commission: 19.32,
      status: "pending",
    },
  ],
  unbilled_order_ids: ["order_1003"],
  totals: { gross: 38.63, refunds: -19.31, net: 19.32 },
};
