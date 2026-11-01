import type { BuyerStage, IntentCategory } from "./enums.js";
import type { BuyerStageV2, IntentCategoryV2 } from "./enums-v2.js";

/**
 * Legacy alias mapping: v1 enum values → canonical v2 (blueprint "Taxonomy
 * alignment" table). Imported v1 records map at READ time — no data
 * rewrite; the lossy direction is documented, nothing is dropped, only
 * re-labelled.
 *
 * The tables are typed Record<v1 value, v2 value>, so a v1 enum value with
 * no mapping entry is a compile error — and the unit tests iterate every
 * published v1 value, so a value with no mapping fails CI twice over.
 */

/**
 * Stage mapping. v2 has no standalone Consideration stage; Comparison
 * becomes Vendor Evaluation (the v1 record's scope field keeps the brand
 * vs product level); Problem Discovery and Expansion are v2-only — v1 data
 * simply never used them.
 */
export const BUYER_STAGE_V1_TO_V2: Record<BuyerStage, BuyerStageV2> = {
  Awareness: "Awareness",
  Consideration: "Solution Research",
  "Solution Research": "Solution Research",
  Comparison: "Vendor Evaluation",
  "Purchase Decision": "Purchase",
};

/**
 * Category mapping. Names that survive into v2 map to themselves
 * (Solution Research, Technical); v1's Comparison category lands on v2's
 * Vendor Comparison (the only comparison category in the Export Spec v2
 * list); Price and Purchase Conditions both land on Pricing; Compatibility
 * and After-sales both land on Implementation. ROI and Future Trends are
 * v2-only — no v1 value maps to them.
 */
export const INTENT_CATEGORY_V1_TO_V2: Record<IntentCategory, IntentCategoryV2> = {
  "Category Question": "Educational",
  "Solution Research": "Solution Research",
  Comparison: "Vendor Comparison",
  Scenario: "Solution Research",
  Price: "Pricing",
  "Risk & Trust": "Compliance",
  Feature: "Technical",
  Compatibility: "Implementation",
  "Purchase Conditions": "Pricing",
  "After-sales": "Implementation",
  Technical: "Technical",
};

/** Read-time mapping of a stored v1 buyer_stage onto the canonical v2 vocabulary. */
export function mapBuyerStageToV2(stage: BuyerStage): BuyerStageV2 {
  return BUYER_STAGE_V1_TO_V2[stage];
}

/** Read-time mapping of a stored v1 intent_category onto the canonical v2 vocabulary. */
export function mapIntentCategoryToV2(category: IntentCategory): IntentCategoryV2 {
  return INTENT_CATEGORY_V1_TO_V2[category];
}
