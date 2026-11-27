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

/**
 * §2.2 Overview module-card fixtures (v1.5 rebuild): the Intent Library
 * card's mini trend and the hero card's AI platform cloud. Chart data is
 * simulated — the blocks render it under a SimulatedLabel.
 */

/** Active-intent count trend (8 weeks) for the Library module card. */
export const INTENT_TREND_FIXTURE: number[] = [4, 5, 5, 7, 9, 10, 12, 14];

/** AI platforms shown in the hero card's icon cloud (DeepLumen §8.1 pattern). */
export const AI_PLATFORMS: string[] = ["ChatGPT", "Gemini", "Perplexity", "Claude", "AI Overviews"];

/** Platform distribution of AI referral sessions for the hero donut. */
export const AI_PLATFORM_DISTRIBUTION_FIXTURE: { label: string; value: number }[] = [
  { label: "ChatGPT", value: 42 },
  { label: "Claude", value: 31 },
  { label: "Gemini", value: 15 },
  { label: "Perplexity", value: 8 },
  { label: "AI Overviews", value: 4 },
];

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

/**
 * §Intent Traffic + Overview Intent Map fixtures (embedded-menu rebuild).
 * Crawler-visit data is NOT live in Phase I — no API field, no route — so
 * every block rendered from here wears the `simulated` chip. The hard
 * guardrail: visibility/visit shares only. No number here may imply a
 * conversion rate, and none may dress up as a measurement.
 */

/** A monitored-landing-page count in the Overview Intent Map card. */
export interface MonitoredPagesByType {
  pageType: "products" | "collections" | "blog" | "home";
  count: number;
}

/** Landing pages the crawler monitors, by page type (simulated). */
export const MONITORED_LANDING_PAGES_FIXTURE: MonitoredPagesByType[] = [
  { pageType: "products", count: 26 },
  { pageType: "collections", count: 6 },
  { pageType: "blog", count: 7 },
  { pageType: "home", count: 1 },
];

/** AI crawl coverage for one page type: collected / total. */
export interface CrawlCoverageByType {
  pageType: MonitoredPagesByType["pageType"];
  collected: number;
  total: number;
}

/** §Intent Traffic (a): crawl coverage per page type (simulated). */
export const AI_CRAWL_COVERAGE_FIXTURE: CrawlCoverageByType[] = [
  { pageType: "products", collected: 26, total: 26 },
  { pageType: "collections", collected: 6, total: 6 },
  { pageType: "blog", collected: 7, total: 7 },
  { pageType: "home", collected: 1, total: 1 },
];

/** §Intent Traffic (b): AI visits by page type, with share-of-total. */
export interface AiVisitsByType {
  pageType: MonitoredPagesByType["pageType"];
  visits: number;
}

/** §Intent Traffic (b) — visits by page type (simulated). */
export const AI_VISITS_BY_TYPE_FIXTURE: AiVisitsByType[] = [
  { pageType: "products", visits: 79 },
  { pageType: "collections", visits: 19 },
  { pageType: "blog", visits: 14 },
  { pageType: "home", visits: 1 },
];

/** §Intent Traffic (c) — trend series keyed by platform or page category. */
export interface AiTrafficTrend {
  day: string;
  series: Record<string, number>;
}

const AI_TRAFFIC_TREND_DAYS: { day: string; claude: number; chatgpt: number; perplexity: number; others: number }[] = [
  { day: "Nov 13", claude: 12, chatgpt: 3, perplexity: 1, others: 1 },
  { day: "Nov 14", claude: 4, chatgpt: 2, perplexity: 0, others: 1 },
  { day: "Nov 15", claude: 1, chatgpt: 2, perplexity: 0, others: 0 },
  { day: "Nov 16", claude: 1, chatgpt: 1, perplexity: 1, others: 0 },
  { day: "Nov 17", claude: 2, chatgpt: 3, perplexity: 0, others: 1 },
  { day: "Nov 18", claude: 0, chatgpt: 1, perplexity: 1, others: 0 },
  { day: "Nov 19", claude: 1, chatgpt: 2, perplexity: 9, others: 0 },
  { day: "Nov 20", claude: 0, chatgpt: 1, perplexity: 4, others: 1 },
  { day: "Nov 21", claude: 1, chatgpt: 2, perplexity: 1, others: 0 },
  { day: "Nov 22", claude: 3, chatgpt: 1, perplexity: 2, others: 0 },
  { day: "Nov 23", claude: 5, chatgpt: 2, perplexity: 1, others: 1 },
  { day: "Nov 24", claude: 6, chatgpt: 3, perplexity: 1, others: 0 },
  { day: "Nov 25", claude: 4, chatgpt: 2, perplexity: 2, others: 1 },
  { day: "Nov 26", claude: 6, chatgpt: 3, perplexity: 31, others: 2 },
];

/** Trend by platform — Claude / ChatGPT / Perplexity / Others (simulated). */
export const AI_TRAFFIC_TREND_BY_PLATFORM: AiTrafficTrend[] = AI_TRAFFIC_TREND_DAYS.map(({ day, ...series }) => ({
  day,
  series,
}));

/**
 * Trend by page category (Products / Collections / Blog / Home) — derived
 * from the same simulated visit pool, split per day (simulated).
 */
export const AI_TRAFFIC_TREND_BY_CATEGORY: AiTrafficTrend[] = AI_TRAFFIC_TREND_DAYS.map(
  ({ day, claude, chatgpt, perplexity, others }) => {
    const total = claude + chatgpt + perplexity + others;
    const products = Math.round(total * 0.74);
    const collections = Math.round(total * 0.17);
    const blog = Math.max(0, total - products - collections - 1);
    return { day, series: { products, collections, blog, home: Math.max(0, total - products - collections - blog) } };
  },
);

/** §Intent Traffic (d): one row of the Top 10 pages by AI visits table. */
export interface TopAiVisitPage {
  url: string;
  pageType: MonitoredPagesByType["pageType"];
  visits: number;
  shareOfVisits: number;
}

/** §Intent Traffic (d) — top pages by AI visits (simulated). */
export const TOP_AI_VISIT_PAGES_FIXTURE: TopAiVisitPage[] = [
  { url: "/products/solix-s2000-power-station", pageType: "products", visits: 41, shareOfVisits: 0.34 },
  { url: "/products/solix-sp200-solar-panel", pageType: "products", visits: 24, shareOfVisits: 0.2 },
  { url: "/blogs/off-grid/run-a-12v-fridge-all-night", pageType: "blog", visits: 13, shareOfVisits: 0.11 },
  { url: "/collections/portable-power-stations", pageType: "collections", visits: 12, shareOfVisits: 0.1 },
  { url: "/products/solix-s2000-vs-rivals", pageType: "products", visits: 9, shareOfVisits: 0.07 },
  { url: "/blogs/off-grid/solar-panel-sizing", pageType: "blog", visits: 7, shareOfVisits: 0.06 },
  { url: "/collections/solar-panels", pageType: "collections", visits: 6, shareOfVisits: 0.05 },
  { url: "/blogs/emergency/home-backup-power", pageType: "blog", visits: 4, shareOfVisits: 0.03 },
  { url: "/products/solix-sp200-refurb", pageType: "products", visits: 3, shareOfVisits: 0.02 },
  { url: "/collections/accessories", pageType: "collections", visits: 1, shareOfVisits: 0.01 },
];

/** Pure helper: total AI visits across the by-type fixture. */
export function totalAiVisits(byType: AiVisitsByType[]): number {
  return byType.reduce((sum, row) => sum + row.visits, 0);
}

/** §Plan example chart — four illustrative attributed-orders series (EXAMPLE, not data). */
export const EXAMPLE_ATTRIBUTED_ORDERS_SERIES: number[][] = [
  [8, 12, 11, 16, 20, 24, 23, 29, 34, 41],
  [3, 5, 6, 8, 9, 12, 14, 16, 19, 24],
  [2, 3, 3, 5, 6, 6, 8, 9, 11, 13],
  [1, 2, 2, 3, 4, 4, 5, 7, 8, 10],
];

/** Pure helper: crawl coverage summary — collected/total and the share. */
export function crawlCoverageSummary(coverage: CrawlCoverageByType[]): {
  collected: number;
  total: number;
  pct: number;
} {
  const collected = coverage.reduce((sum, row) => sum + row.collected, 0);
  const total = coverage.reduce((sum, row) => sum + row.total, 0);
  return { collected, total, pct: total === 0 ? 0 : Math.round((collected / total) * 100) };
}
