import { describe, expect, it } from "vitest";

import { validateCandidate, validateCandidates, type ValidationContext } from "../src/validate.js";
import { PDP_URL, PRODUCT, SNAPSHOT, SPECS_URL, baseCandidate } from "./fixtures.js";

function context(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    scope: "product",
    brand_id: "brand_example",
    country: "AU",
    language: "en",
    allowed_evidence_urls: [PDP_URL, SPECS_URL],
    allowed_sku_ids: ["sku_example_01", "sku_example_02"],
    generation_model: "fixture-model",
    ...overrides,
  };
}

describe("validateCandidate — fabricated measurement", () => {
  it("drops a candidate with a non-null visibility_pct as fabricated_measurement", () => {
    const outcome = validateCandidate(baseCandidate({ visibility_pct: 12.5 }), context());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.event.reason).toBe("fabricated_measurement");
      expect(outcome.event.detail).toContain("visibility_pct");
    }
  });

  it("drops a candidate with a non-null monthly_search_volume", () => {
    const outcome = validateCandidate(baseCandidate({ monthly_search_volume: 4800 }), context());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.event.reason).toBe("fabricated_measurement");
    }
  });

  it("drops a candidate that claims a measurement status", () => {
    const outcome = validateCandidate(baseCandidate({ measurement_status: "measured" }), context());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.event.reason).toBe("fabricated_measurement");
      expect(outcome.event.detail).toContain("measured");
    }
  });

  it("accepts the explicit standalone nulls", () => {
    const outcome = validateCandidate(
      baseCandidate({
        measurement_status: "not_measured",
        measurement_source: null,
        visibility_pct: null,
        monthly_search_volume: null,
      }),
      context(),
    );
    expect(outcome.ok).toBe(true);
  });
});

describe("validateCandidate — evidence", () => {
  it("drops a candidate with no evidence_urls", () => {
    const outcome = validateCandidate(baseCandidate({ evidence_urls: [] }), context());
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.event.reason).toBe("missing_evidence");
    }
  });

  it("drops a candidate citing a URL outside the registry", () => {
    const outcome = validateCandidate(
      baseCandidate({ evidence_urls: ["https://evil.example.com/fake"] }),
      context(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.event.reason).toBe("unevidenced_claim");
      expect(outcome.event.detail).toContain("evil.example.com");
    }
  });

  it("accepts a candidate citing only registry URLs", () => {
    const outcome = validateCandidate(
      baseCandidate({ evidence_urls: [PDP_URL, SPECS_URL] }),
      context(),
    );
    expect(outcome.ok).toBe(true);
  });
});

describe("validateCandidate — SKU claims", () => {
  it("drops a candidate referencing an SKU the profile does not evidence", () => {
    const outcome = validateCandidate(
      baseCandidate({ sku_ids: ["sku_unknown_99"] }),
      context(),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.event.reason).toBe("unevidenced_claim");
      expect(outcome.event.detail).toContain("sku_unknown_99");
    }
  });

  it("drops brand-scope candidates that reference SKUs at all", () => {
    const outcome = validateCandidate(
      baseCandidate({ sku_ids: ["sku_example_01"] }),
      context({ scope: "brand", allowed_sku_ids: [] }),
    );
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.event.reason).toBe("unevidenced_claim");
    }
  });
});

describe("validateCandidates", () => {
  it("injects pipeline-owned identity into accepted drafts", () => {
    const summary = validateCandidates([baseCandidate()], context());
    expect(summary.accepted).toHaveLength(1);
    const draft = summary.accepted[0];
    expect(draft).toMatchObject({
      scope: "product",
      brand_id: "brand_example",
      country: "AU",
      language: "en",
      generation_model: "fixture-model",
      confidence: "medium",
    });
    expect(draft?.evidence_urls).toEqual([PDP_URL]);
  });

  it("defaults missing confidence to low", () => {
    const candidate = baseCandidate();
    delete (candidate as Partial<typeof candidate>).confidence;
    const summary = validateCandidates([candidate], context());
    expect(summary.accepted[0]?.confidence).toBe("low");
  });

  it("separates accepted drafts from drops in order", () => {
    const summary = validateCandidates(
      [
        baseCandidate({ intent_name: "Good One" }),
        baseCandidate({ intent_name: "No Evidence", evidence_urls: [] }),
        baseCandidate({ intent_name: "Fabricator", visibility_pct: 50 }),
        baseCandidate({ intent_name: "Good Two", intent_category: "Feature" }),
      ],
      context(),
    );
    expect(summary.accepted.map((draft) => draft.intent_name)).toEqual(["Good One", "Good Two"]);
    expect(summary.dropped.map((event) => event.reason)).toEqual([
      "missing_evidence",
      "fabricated_measurement",
    ]);
  });

  it("validates against the exact snapshot registry supplied in the run", () => {
    // Registry from the actual stored snapshots — the property test's shape.
    const summary = validateCandidates([baseCandidate()], {
      scope: "product",
      brand_id: "brand_example",
      country: "AU",
      language: "en",
      allowed_evidence_urls: PRODUCT.snapshot_refs.map((ref) => ref.url),
      allowed_sku_ids: PRODUCT.skus.map((sku) => sku.sku_id),
      generation_model: "fixture-model",
    });
    expect(summary.accepted).toHaveLength(1);
    expect(SNAPSHOT.url).toBe(PDP_URL);
  });
});
