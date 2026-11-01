/**
 * Intent Schema v2 vocabularies (blueprint art_9zAvKcEq; Export Spec v2
 * taxonomy).
 *
 * v2 adopts the Spotlize Buyer-Intent Export Spec v2 vocabulary as
 * canonical: 6 buyer stages and 10 intent categories. The v1 vocabularies
 * in enums.ts stay published as legacy values — legacy-mapping.ts maps them
 * onto these at read time, so stored v1 data is re-labelled, never
 * rewritten.
 */

/** Canonical v2 buyer stages (Export Spec v2 "Buyer Stage Definition"). */
export const BUYER_STAGES_V2 = [
  "Awareness",
  "Problem Discovery",
  "Solution Research",
  "Vendor Evaluation",
  "Purchase",
  "Expansion",
] as const;
export type BuyerStageV2 = (typeof BUYER_STAGES_V2)[number];

/** Canonical v2 intent categories (Export Spec v2 "Intent Category Definition"). */
export const INTENT_CATEGORIES_V2 = [
  "Educational",
  "Pain Point",
  "Solution Research",
  "Vendor Comparison",
  "Pricing",
  "ROI",
  "Implementation",
  "Technical",
  "Compliance",
  "Future Trends",
] as const;
export type IntentCategoryV2 = (typeof INTENT_CATEGORIES_V2)[number];

/**
 * Where a stored value's data came from — the mode-leakage guard (blueprint
 * validation family 2). `llm_estimated` marks LLM-produced estimates
 * (demand tiers, fit scores); `llm_simulated` marks LLM-simulated monitoring
 * answers and everything derived from them; `provider_measured` marks values
 * from a real third-party source. Simulated data is never rendered as
 * measured: every generated or monitored record carries this field.
 */
export const DATA_MODES = ["llm_estimated", "llm_simulated", "provider_measured"] as const;
export type DataMode = (typeof DATA_MODES)[number];

/**
 * Measurement-side records only: monitoring runs and metrics are either
 * simulated or measured. `llm_estimated` is a demand-side mode and can
 * never describe a run or a metric.
 */
export const RUN_DATA_MODES = ["llm_simulated", "provider_measured"] as const;
export type RunDataMode = (typeof RUN_DATA_MODES)[number];

/**
 * v2 measurement status: v1's vocabulary plus "simulated". Lib publish
 * flips matching intent records to "simulated" (lightweight tier) or
 * "measured" (advanced tier); the v1 invariant is preserved — a
 * not_measured record carries no measurement values, and a simulated
 * record is never presented as measured.
 */
export const MEASUREMENT_STATUSES_V2 = [
  "not_measured",
  "imported",
  "simulated",
  "measured",
] as const;
export type MeasurementStatusV2 = (typeof MEASUREMENT_STATUSES_V2)[number];

/**
 * Demand is consumed only as tiers in lightweight mode — never as numbers a
 * customer could copy (blueprint Stage A.3).
 */
export const DEMAND_TIERS = ["high", "medium", "low"] as const;
export type DemandTier = (typeof DEMAND_TIERS)[number];

/** Monitored AI-search platforms (blueprint Stage C; Monitor Skill §3). */
export const PLATFORMS = [
  "chatgpt_search",
  "perplexity",
  "google_ai_overviews",
  "gemini",
] as const;
export type Platform = (typeof PLATFORMS)[number];

/** Prompt lifecycle: Stage B emits drafts; Gate 2 approval flips to confirmed. */
export const PROMPT_STATUSES = ["draft", "confirmed", "retired"] as const;
export type PromptStatus = (typeof PROMPT_STATUSES)[number];

/** The three MECE scenario types every persona maps (blueprint Stage A.2). */
export const SCENARIO_TYPES = [
  "daily_pain",
  "acute_trigger",
  "final_shelf_comparison",
] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

/** Business models resolved in Stage A.1 entity resolution. */
export const BUSINESS_MODELS = ["dtc", "amazon", "b2b", "affiliate"] as const;
export type BusinessModel = (typeof BUSINESS_MODELS)[number];

/** Competitor relation to the monitored brand (Stage A.1 competitor set). */
export const COMPETITOR_RELATIONS = ["direct", "indirect"] as const;
export type CompetitorRelation = (typeof COMPETITOR_RELATIONS)[number];

/**
 * Derived S/A/B priority (blueprint Stage A.4) — stored alongside the three
 * raw dimensions, never authored: S = high volume + strong fit + open gap;
 * A = clear demand but entrenched competitors; B = long-tail or monopolized.
 */
export const PRIORITY_TIERS = ["S", "A", "B"] as const;
export type PriorityTier = (typeof PRIORITY_TIERS)[number];

/**
 * Baseline consensus over the 3 baseline rounds (blueprint Stage C.2):
 * all rounds agree within ±10 points → stable; otherwise noisy. A noisy
 * prompt's number is not published.
 */
export const CONSENSUS_FLAGS = ["stable", "noisy"] as const;
export type ConsensusFlag = (typeof CONSENSUS_FLAGS)[number];

/**
 * Lib-publish rule (blueprint Stage C.3): the data mode that produced the
 * metrics decides the measurement status the published intent records get.
 * `llm_estimated` is deliberately unmapped — an estimate never publishes as
 * a measurement status, which is the read-side separation of simulated from
 * measured.
 */
export const MEASUREMENT_STATUS_BY_RUN_DATA_MODE: Record<RunDataMode, "simulated" | "measured"> = {
  llm_simulated: "simulated",
  provider_measured: "measured",
};
