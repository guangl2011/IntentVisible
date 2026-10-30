/**
 * Shared test fixtures. The intent example is the plan's section 4.1
 * canonical JSON, tightened to the spec's Data-contract record (which adds
 * intent_version and measurement_source: null). All values are placeholder
 * data in the style of the spec examples — nothing here is measured.
 */

export function cloneFixture(fixture: Record<string, unknown>): Record<string, unknown> {
  return structuredClone(fixture);
}

export function mutatedFixture(
  fixture: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...cloneFixture(fixture), ...patch };
}

export function withoutKeys(
  fixture: Record<string, unknown>,
  ...keys: string[]
): Record<string, unknown> {
  const clone = cloneFixture(fixture);
  for (const key of keys) {
    delete clone[key];
  }
  return clone;
}

export const specExampleIntentRecord: Record<string, unknown> = {
  schema_version: "1.0.0",
  intent_id: "int_camping_fridge_runtime",
  intent_version: 1,
  scope: "product",
  brand_id: "brand_solix",
  intent_name: "Camping Fridge Runtime",
  buyer_stage: "Solution Research",
  intent_category: "Technical",
  persona: "Camper/Overlander",
  pain_point: "Need realistic runtime for a camping fridge",
  country: "AU",
  language: "en",
  prompts: ["Which portable power station can run a camping fridge overnight?"],
  recommended_content: "Runtime guide with appliance assumptions",
  recommended_cta: "Check compatible models",
  sku_ids: ["sku_example_01", "sku_example_02"],
  evidence_urls: ["https://example.com/products/example"],
  generation_method: "llm_with_page_evidence",
  measurement_status: "not_measured",
  measurement_source: null,
  visibility_pct: null,
  monthly_search_volume: null,
  confidence: "medium",
};

export const exampleBrandProfile: Record<string, unknown> = {
  schema_version: "1.0.0",
  brand_id: "brand_example",
  name: "Example Outdoors",
  domain: "example.com",
  description: "Placeholder brand used by schema tests.",
  categories: ["portable power stations"],
  competitor_brands: ["Rival Co"],
  differentiators: ["10-year warranty stated on the about page"],
  use_cases: ["camping", "overlanding"],
  personas: ["Camper/Overlander"],
  pain_points: ["unreliable runtime estimates"],
  purchase_barriers: ["unclear warranty terms"],
  trust_evidence: ["10-year warranty page", "third-party review badges"],
  evidence_urls: ["https://example.com/about", "https://example.com/products/example"],
  snapshot_refs: [
    {
      url: "https://example.com/about",
      content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      fetched_at: "2026-10-30T00:00:00Z",
      storage_ref: "snapshots/example.com/about/e3b0c442.html",
    },
  ],
  generation_method: "deterministic_extraction",
};

export const exampleProductProfile: Record<string, unknown> = {
  schema_version: "1.0.0",
  product_id: "product_example_01",
  brand_id: "brand_example",
  name: "Example Portable Power Station 1000",
  url: "https://example.com/products/example",
  description: "Placeholder product used by schema tests.",
  price: { amount: 999.99, currency: "AUD" },
  features: ["1024Wh capacity", "LiFePO4 cells"],
  specifications: [{ name: "Capacity", value: "1024Wh" }],
  use_cases: ["camping fridge power"],
  compatibility: ["12V camping fridges"],
  faqs: [{ question: "How long does it run a fridge?", answer: "See the runtime guide." }],
  skus: [
    {
      sku_id: "sku_example_01",
      name: "1000 Base",
      price: { amount: 999.99, currency: "AUD" },
      url: "https://example.com/products/example",
    },
  ],
  shipping_and_returns: ["30-day returns per the policy page"],
  evidence_urls: ["https://example.com/products/example"],
  snapshot_refs: [
    {
      url: "https://example.com/products/example",
      content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      fetched_at: "2026-10-30T00:00:00Z",
      storage_ref: "snapshots/example.com/products/example/e3b0c442.html",
    },
  ],
  generation_method: "llm_with_page_evidence",
  generated_at: "2026-10-30T00:00:00Z",
};

export const exampleSkuIntentMapping: Record<string, unknown> = {
  schema_version: "1.0.0",
  mapping_id: "map_camping_fridge_runtime_sku_example_01",
  intent_id: "int_camping_fridge_runtime",
  sku_id: "sku_example_01",
  product_id: "product_example_01",
  match_strength: 0.82,
  eligibility: "unverified",
  landing_url: "https://example.com/products/example",
  evidence_urls: ["https://example.com/products/example"],
};
