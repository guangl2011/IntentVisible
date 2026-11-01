import { describe, expect, it } from "vitest";

import {
  BUYER_STAGE_V1_TO_V2,
  BUYER_STAGES,
  BUYER_STAGES_V2,
  INTENT_CATEGORY_V1_TO_V2,
  INTENT_CATEGORIES,
  INTENT_CATEGORIES_V2,
  MEASUREMENT_STATUSES,
  MEASUREMENT_STATUSES_V2,
  MEASUREMENT_STATUS_BY_RUN_DATA_MODE,
  mapBuyerStageToV2,
  mapIntentCategoryToV2,
  type BuyerStage,
  type IntentCategory,
} from "./index.js";

/**
 * Canonical v2 vocabularies and the legacy alias mapping (blueprint
 * "Taxonomy alignment"). The exact tables below are transcribed from the
 * blueprint's migration table; a v1 enum value with no mapping entry is a
 * compile error (Record<v1, v2>) and fails these tests on top.
 */
describe("canonical v2 taxonomies", () => {
  it("publishes the six Export Spec v2 buyer stages in order", () => {
    expect([...BUYER_STAGES_V2]).toEqual([
      "Awareness",
      "Problem Discovery",
      "Solution Research",
      "Vendor Evaluation",
      "Purchase",
      "Expansion",
    ]);
  });

  it("publishes the ten Export Spec v2 intent categories in order", () => {
    expect([...INTENT_CATEGORIES_V2]).toEqual([
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
    ]);
  });
});

describe("buyer stage v1 -> v2 mapping", () => {
  it("maps every published v1 stage (a v1 value with no mapping fails CI)", () => {
    for (const stage of BUYER_STAGES) {
      expect(BUYER_STAGE_V1_TO_V2[stage as BuyerStage], `v1 stage ${stage}`).toBeDefined();
    }
    expect(Object.keys(BUYER_STAGE_V1_TO_V2).sort()).toEqual([...BUYER_STAGES].sort());
  });

  it("follows the blueprint's migration table exactly", () => {
    expect(mapBuyerStageToV2("Awareness")).toBe("Awareness");
    expect(mapBuyerStageToV2("Consideration")).toBe("Solution Research");
    expect(mapBuyerStageToV2("Solution Research")).toBe("Solution Research");
    expect(mapBuyerStageToV2("Comparison")).toBe("Vendor Evaluation");
    expect(mapBuyerStageToV2("Purchase Decision")).toBe("Purchase");
  });

  it("only produces canonical v2 stage values", () => {
    for (const mapped of Object.values(BUYER_STAGE_V1_TO_V2)) {
      expect(BUYER_STAGES_V2).toContain(mapped);
    }
  });

  it("never invents v2-only stages from v1 data (Problem Discovery, Expansion are v2-only)", () => {
    expect(Object.values(BUYER_STAGE_V1_TO_V2)).not.toContain("Problem Discovery");
    expect(Object.values(BUYER_STAGE_V1_TO_V2)).not.toContain("Expansion");
  });
});

describe("intent category v1 -> v2 mapping", () => {
  it("maps every published v1 category (a v1 value with no mapping fails CI)", () => {
    for (const category of INTENT_CATEGORIES) {
      expect(
        INTENT_CATEGORY_V1_TO_V2[category as IntentCategory],
        `v1 category ${category}`,
      ).toBeDefined();
    }
    expect(Object.keys(INTENT_CATEGORY_V1_TO_V2).sort()).toEqual(
      [...INTENT_CATEGORIES].sort(),
    );
  });

  it("follows the blueprint's migration table exactly", () => {
    expect(mapIntentCategoryToV2("Category Question")).toBe("Educational");
    expect(mapIntentCategoryToV2("Solution Research")).toBe("Solution Research");
    expect(mapIntentCategoryToV2("Comparison")).toBe("Vendor Comparison");
    expect(mapIntentCategoryToV2("Scenario")).toBe("Solution Research");
    expect(mapIntentCategoryToV2("Price")).toBe("Pricing");
    expect(mapIntentCategoryToV2("Risk & Trust")).toBe("Compliance");
    expect(mapIntentCategoryToV2("Feature")).toBe("Technical");
    expect(mapIntentCategoryToV2("Compatibility")).toBe("Implementation");
    expect(mapIntentCategoryToV2("Purchase Conditions")).toBe("Pricing");
    expect(mapIntentCategoryToV2("After-sales")).toBe("Implementation");
    expect(mapIntentCategoryToV2("Technical")).toBe("Technical");
  });

  it("only produces canonical v2 category values", () => {
    for (const mapped of Object.values(INTENT_CATEGORY_V1_TO_V2)) {
      expect(INTENT_CATEGORIES_V2).toContain(mapped);
    }
  });

  it("never maps v1 data onto the v2-only categories (ROI, Future Trends)", () => {
    expect(Object.values(INTENT_CATEGORY_V1_TO_V2)).not.toContain("ROI");
    expect(Object.values(INTENT_CATEGORY_V1_TO_V2)).not.toContain("Future Trends");
  });
});

describe("measurement status v2 (simulated separated from measured)", () => {
  it("extends the v1 statuses with imported + simulated and keeps every v1 value valid", () => {
    expect([...MEASUREMENT_STATUSES_V2]).toEqual([
      "not_measured",
      "imported",
      "simulated",
      "measured",
    ]);
    for (const status of MEASUREMENT_STATUSES) {
      expect(MEASUREMENT_STATUSES_V2).toContain(status);
    }
  });

  it("maps each run-side data mode to the status it earns at lib publish", () => {
    expect(MEASUREMENT_STATUS_BY_RUN_DATA_MODE.llm_simulated).toBe("simulated");
    expect(MEASUREMENT_STATUS_BY_RUN_DATA_MODE.provider_measured).toBe("measured");
  });
});
