import { describe, expect, it } from "vitest";

import {
  BUYER_STAGES,
  CONFIDENCE_LEVELS,
  ELIGIBILITY_STATUSES,
  GENERATION_METHODS,
  INTENT_CATEGORIES,
  MEASUREMENT_STATUSES,
  OPPORTUNITY_TYPES,
  SCOPES,
  IntentRecordSchema,
  SkuIntentMappingSchema,
} from "../src/index.js";
import {
  exampleSkuIntentMapping,
  mutatedFixture,
  specExampleIntentRecord,
} from "../src/fixtures.js";

import { isRejected } from "./helpers.js";

describe("buyer_stage vocabulary", () => {
  it("accepts every published value", () => {
    expect([...BUYER_STAGES]).toEqual([
      "Awareness",
      "Consideration",
      "Solution Research",
      "Comparison",
      "Purchase Decision",
    ]);
    for (const stage of BUYER_STAGES) {
      expect(
        isRejected(
          IntentRecordSchema,
          mutatedFixture(specExampleIntentRecord, { buyer_stage: stage }),
        ),
      ).toBe(false);
    }
  });

  it("rejects near-miss values outside the vocabulary", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { buyer_stage: "Decision" }),
      ),
    ).toBe(true);
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { buyer_stage: "solution research" }),
      ),
    ).toBe(true);
  });
});

describe("intent_category vocabulary", () => {
  it("accepts every published value", () => {
    expect([...INTENT_CATEGORIES]).toEqual([
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
    ]);
    for (const category of INTENT_CATEGORIES) {
      expect(
        isRejected(
          IntentRecordSchema,
          mutatedFixture(specExampleIntentRecord, { intent_category: category }),
        ),
      ).toBe(false);
    }
  });

  it("rejects values outside the v1 vocabulary", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { intent_category: "Pricing" }),
      ),
    ).toBe(true);
  });
});

describe("confidence vocabulary", () => {
  it("accepts exactly low|medium|high", () => {
    expect([...CONFIDENCE_LEVELS]).toEqual(["low", "medium", "high"]);
    for (const confidence of CONFIDENCE_LEVELS) {
      expect(
        isRejected(IntentRecordSchema, mutatedFixture(specExampleIntentRecord, { confidence })),
      ).toBe(false);
    }
  });

  it("rejects invented levels", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { confidence: "certain" }),
      ),
    ).toBe(true);
  });
});

describe("measurement_status vocabulary", () => {
  it("accepts exactly not_measured|imported|measured", () => {
    expect([...MEASUREMENT_STATUSES]).toEqual(["not_measured", "imported", "measured"]);
  });

  it("rejects invented statuses", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { measurement_status: "measured_live" }),
      ),
    ).toBe(true);
  });
});

describe("scope and generation_method vocabularies", () => {
  it("accepts brand and product scope", () => {
    expect([...SCOPES]).toEqual(["brand", "product"]);
  });

  it("rejects unknown scope", () => {
    expect(
      isRejected(IntentRecordSchema, mutatedFixture(specExampleIntentRecord, { scope: "site" })),
    ).toBe(true);
  });

  it("requires evidence-backed generation methods", () => {
    // "imported" marks records produced by the Solix golden-dataset
    // importer; the engine and extractor produce the other two.
    expect([...GENERATION_METHODS]).toEqual([
      "llm_with_page_evidence",
      "deterministic_extraction",
      "imported",
    ]);
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { generation_method: "llm" }),
      ),
    ).toBe(true);
  });
});

describe("opportunity_type (standalone substitute)", () => {
  it("accepts hypothesis on a generated record", () => {
    const withType = mutatedFixture(specExampleIntentRecord, { opportunity_type: "hypothesis" });
    expect(isRejected(IntentRecordSchema, withType)).toBe(false);
  });

  it("rejects measured-opportunity values", () => {
    expect(
      isRejected(
        IntentRecordSchema,
        mutatedFixture(specExampleIntentRecord, { opportunity_type: "measured_gap" }),
      ),
    ).toBe(true);
  });

  it("publishes exactly the standalone vocabulary", () => {
    expect([...OPPORTUNITY_TYPES]).toEqual(["hypothesis"]);
  });
});

describe("eligibility vocabulary (SkuIntentMapping)", () => {
  it("accepts exactly eligible|ineligible|unverified", () => {
    expect([...ELIGIBILITY_STATUSES]).toEqual(["eligible", "ineligible", "unverified"]);
    for (const eligibility of ELIGIBILITY_STATUSES) {
      expect(
        isRejected(
          SkuIntentMappingSchema,
          mutatedFixture(exampleSkuIntentMapping, { eligibility }),
        ),
      ).toBe(false);
    }
  });
});
