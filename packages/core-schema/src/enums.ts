/**
 * Intent Schema v1 vocabularies.
 *
 * Provenance of buyer_stage and intent_category values: the plan's M2
 * intent-type lists (brand-level: category questions, solution research,
 * brand comparison, scenarios, price, risk & trust; product-level:
 * features, use scenarios, compatibility, comparison, purchase conditions,
 * after-sales) plus the "Solution Research" stage and "Technical" category
 * from the plan's section 4.1 example. Brand and product comparison are
 * merged into "Comparison" — the record's scope field distinguishes the
 * level. The Solix source file may extend these vocabularies when the
 * importer PR lands; extensions go through a dedicated schema PR only.
 */

export const BUYER_STAGES = [
  "Awareness",
  "Consideration",
  "Solution Research",
  "Comparison",
  "Purchase Decision",
] as const;
export type BuyerStage = (typeof BUYER_STAGES)[number];

export const INTENT_CATEGORIES = [
  "Category Question",
  "Solution Research",
  "Comparison",
  "Scenario",
  "Price",
  "Risk & Trust",
  "Feature",
  "Compatibility",
  "Purchase Conditions",
  "After-sales",
  "Technical",
] as const;
export type IntentCategory = (typeof INTENT_CATEGORIES)[number];

/**
 * Confidence in page-evidence support for a record — never a conversion
 * prediction (plan section 2.1).
 */
export const CONFIDENCE_LEVELS = ["low", "medium", "high"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

/**
 * not_measured = standalone generation (the only state this package's
 * pipeline produces); imported = trusted dataset (Solix golden corpus);
 * measured = a real monitoring source (future optional Visible adapter).
 */
export const MEASUREMENT_STATUSES = ["not_measured", "imported", "measured"] as const;
export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];

/** Every value has a producing pipeline: engine, extractor, importer. */
export const GENERATION_METHODS = [
  "llm_with_page_evidence",
  "deterministic_extraction",
  "imported",
] as const;
export type GenerationMethod = (typeof GENERATION_METHODS)[number];

export const SCOPES = ["brand", "product"] as const;
export type Scope = (typeof SCOPES)[number];

/** Standalone-mode substitute for the measurement-derived expansion labels (plan section 2.1). */
export const OPPORTUNITY_TYPES = ["hypothesis"] as const;
export type OpportunityType = (typeof OPPORTUNITY_TYPES)[number];

/** Promotional/affiliate eligibility; standalone mode emits "unverified". */
export const ELIGIBILITY_STATUSES = ["eligible", "ineligible", "unverified"] as const;
export type EligibilityStatus = (typeof ELIGIBILITY_STATUSES)[number];
