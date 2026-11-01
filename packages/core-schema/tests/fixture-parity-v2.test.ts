import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  BUYER_STAGES,
  BUYER_STAGES_V2,
  INTENT_CATEGORIES,
  INTENT_CATEGORIES_V2,
  mapBuyerStageToV2,
  mapIntentCategoryToV2,
  type BuyerStage,
  type IntentCategory,
} from "../src/index.js";

/**
 * Parity over the existing v1 fixtures: every imported Solix record must
 * map through the legacy alias tables onto valid canonical v2 values at
 * read time (blueprint: "Imported Solix records map through the same table
 * at read time — no data rewrite"). The JSON fixture mirrors the CSV rows;
 * a new v1 enum value reaching either fixture fails here if unmapped.
 */
const FIXTURE_PATH = "../../intent-importer/fixture/solix-sample.json";

interface ImportedRow {
  "Buyer Stage": string;
  "Intent Category": string;
}

describe("importer fixture rows map onto canonical v2", () => {
  const rows = JSON.parse(
    readFileSync(new URL(FIXTURE_PATH, import.meta.url), "utf8"),
  ) as ImportedRow[];

  it("loads the fixture (guard against a moved file silently passing)", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("carries v1 vocabulary in every row", () => {
    for (const row of rows) {
      expect(BUYER_STAGES, `stage ${row["Buyer Stage"]}`).toContain(row["Buyer Stage"]);
      expect(INTENT_CATEGORIES, `category ${row["Intent Category"]}`).toContain(
        row["Intent Category"],
      );
    }
  });

  it("maps every fixture stage to a valid v2 stage", () => {
    for (const row of rows) {
      const mapped = mapBuyerStageToV2(row["Buyer Stage"] as BuyerStage);
      expect(BUYER_STAGES_V2).toContain(mapped);
    }
  });

  it("maps every fixture category to a valid v2 category", () => {
    for (const row of rows) {
      const mapped = mapIntentCategoryToV2(row["Intent Category"] as IntentCategory);
      expect(INTENT_CATEGORIES_V2).toContain(mapped);
    }
  });

  it("maps the fixture's legacy-only values the way the blueprint specifies", () => {
    const stages = new Set(rows.map((row) => row["Buyer Stage"]));
    const categories = new Set(rows.map((row) => row["Intent Category"]));

    if (stages.has("Comparison")) {
      expect(mapBuyerStageToV2("Comparison")).toBe("Vendor Evaluation");
    }
    if (stages.has("Consideration")) {
      expect(mapBuyerStageToV2("Consideration")).toBe("Solution Research");
    }
    if (categories.has("Comparison")) {
      expect(mapIntentCategoryToV2("Comparison")).toBe("Vendor Comparison");
    }
    if (categories.has("Risk & Trust")) {
      expect(mapIntentCategoryToV2("Risk & Trust")).toBe("Compliance");
    }
    if (categories.has("Scenario")) {
      expect(mapIntentCategoryToV2("Scenario")).toBe("Solution Research");
    }
  });
});
