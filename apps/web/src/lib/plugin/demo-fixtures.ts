import type { PipelineStep } from "../../app/(plugin)/plugin/components/visual-patterns";

/**
 * Demo fixtures for §2 blocks whose backing data does not exist yet (no
 * API field, no route). Every block rendered from here MUST wear the
 * `simulated` chip (SimulatedLabel) — the red line is that a fixture
 * never dresses up as a measurement. Nothing here may be presented as
 * 实测, and nothing fabricates a number the API will one day own.
 */

/** §2.3 Site Research — terminal-style progress steps. */
export const SITE_RESEARCH_STEPS: PipelineStep[] = [
  {
    script: "iv research scan https://solix-demo.myshopify.com",
    title: "Store content scan",
    output: "48 pages discovered · robots-aware fetch · snapshots stored",
  },
  {
    script: "iv research sources --verify",
    title: "Source collection & evidence chain",
    output: "3 source classes: Shopify App ping · script ping · URL fallback · 52 evidence sentences kept",
  },
  {
    script: "iv research map --derive",
    title: "Marketing map derivation",
    output: "personas × scenarios × competitors derived from evidence — review before publish",
  },
];

/** §2.3 Marketing Map — persona × scenario × competitor cards. */
export interface MapNode {
  persona: string;
  scenario: string;
  competitor: string;
  evidence: string;
  assumption: boolean;
}

export const MARKETING_MAP_NODES: MapNode[] = [
  {
    persona: "RV boondocker",
    scenario: "Running a 12V fridge off a portable power station overnight",
    competitor: "EcoFlow",
    evidence: "Fridge-runtime questions dominate the store's AI referral prompts.",
    assumption: false,
  },
  {
    persona: "Van-life weekend camper",
    scenario: "Recharging a station from rooftop solar while parked",
    competitor: "Jackery",
    evidence: "Solar-recharge scenarios recur across the catalog's product pages.",
    assumption: false,
  },
  {
    persona: "Emergency-prep homeowner",
    scenario: "Backup power for a home freezer during outages",
    competitor: "Anker SOLIX",
    evidence: "No page currently answers the outage-backup scenario — derived as an assumption.",
    assumption: true,
  },
];

/** §2.3 Products & SKUs — SKU ↔ intent mapping eligibility. */
export interface SkuMapping {
  sku: string;
  product: string;
  intentId: string;
  intentName: string;
  eligible: boolean;
  inventoryState: string;
}

export const SKU_MAPPINGS: SkuMapping[] = [
  {
    sku: "SOLIX-S2000",
    product: "Solix S2000 Portable Power Station",
    intentId: "intent_s2000_vs_rivals",
    intentName: "S2000 vs rival power stations",
    eligible: true,
    inventoryState: "in stock",
  },
  {
    sku: "SOLIX-SP200",
    product: "Solix SP200 Solar Panel",
    intentId: "intent_solar_sizing",
    intentName: "Solar panel sizing for S2000",
    eligible: true,
    inventoryState: "low stock",
  },
];

/** §2.5 Intent → Page — matching request replay (scenario → filter → score). */
export interface MatchReplay {
  scenario: string;
  signals: string;
  hardFilter: "pass" | "excluded";
  matchScore: number;
  productCard: string;
}

export const MATCH_REPLAYS: MatchReplay[] = [
  {
    scenario: "AI buyer asks: which power station runs a 12V fridge longest",
    signals: "prompt match · product scope · active status",
    hardFilter: "pass",
    matchScore: 0.93,
    productCard: "Solix S2000 — 2,000Wh LiFePO4, fridge-runtime table from the intent's evidence chain",
  },
  {
    scenario: "AI buyer asks: what solar panel pairs with the S2000",
    signals: "prompt match · accessory scope · low-stock inventory",
    hardFilter: "pass",
    matchScore: 0.81,
    productCard: "Solix SP200 — panel-sizing guidance carried from the intent's pain point",
  },
  {
    scenario: "AI buyer asks: gasoline generator comparison",
    signals: "category mismatch — no fuel-burning SKUs in the catalog",
    hardFilter: "excluded",
    matchScore: 0.0,
    productCard: "— (hard filter excluded this request; no product card rendered)",
  },
];

/** §2.6 Billing — the plan/billing state Settings ▸ Billing shows. */
export interface BillingPlanState {
  plan: string;
  note: string;
  summary: string;
  track_a_rate_band: { min: number; max: number };
  track_a_totals: { gross: number; refunds: number; net: number };
}

export const BILLING_PLAN: BillingPlanState = {
  plan: "Phase I — free install",
  note: "no base fee, no subscription",
  summary:
    "Track A (order-attribution commission) bills per attributed order in the locked 5–20% band once partner channels are live — see Commission for the per-order ledger. Track B (ad-optimization effect fee) stays a Phase II gray release; it bills only verified, baseline-validated improvements.",
  track_a_rate_band: { min: 0.05, max: 0.2 },
  track_a_totals: { gross: 38.63, refunds: -19.31, net: 19.32 },
};

/** Demo values for Commission's §2.5 columns the ledger payload lacks. */
export interface CommissionDemoColumns {
  orderDates: Record<string, string>;
  orderTotals: Record<string, number>;
}

export const COMMISSION_DEMO_COLUMNS: CommissionDemoColumns = {
  orderDates: { "#1001": "2026-11-18", "#1002": "2026-11-20", "#1003": "2026-11-21", "#1004": "2026-11-22" },
  orderTotals: { "#1001": 899.0, "#1002": 499.0, "#1003": 649.0, "#1004": 99.9 },
};

/** §2.2 Agentic Store Summary — llms.txt / structured-layer status. */
export const LLMS_TXT_STATUS = "llms.txt published at /llms.txt (structured layer v1)";
