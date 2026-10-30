import { describe, expect, it } from "vitest";

import * as coreSchema from "./index.js";

describe("core-schema", () => {
  it("publishes the current schema version", () => {
    expect(coreSchema.SCHEMA_VERSION).toBe("1.0.0");
    expect(coreSchema.SUPPORTED_SCHEMA_MAJOR).toBe(1);
  });

  it("exposes the four entity validators at runtime", () => {
    const validators = [
      "IntentRecordSchema",
      "BrandProfileSchema",
      "ProductProfileSchema",
      "SkuIntentMappingSchema",
    ] as const;
    for (const name of validators) {
      expect(coreSchema[name], `${name} should be exported`).toBeDefined();
    }
  });

  it("exposes the enum vocabularies for consumers", () => {
    for (const name of [
      "BUYER_STAGES",
      "INTENT_CATEGORIES",
      "CONFIDENCE_LEVELS",
      "MEASUREMENT_STATUSES",
      "OPPORTUNITY_TYPES",
      "GENERATION_METHODS",
      "SCOPES",
      "ELIGIBILITY_STATUSES",
    ] as const) {
      expect(coreSchema[name], `${name} should be exported`).toBeDefined();
    }
  });
});
