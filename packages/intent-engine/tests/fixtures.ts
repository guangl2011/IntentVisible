/**
 * Shared test fixtures for the intent-engine package. The brand/product
 * profiles mirror what the URL extractor emits (and the core schemas
 * validate); candidate texts are recorded-style LLM output — the same shape
 * a live model would return.
 */

import {
  BrandProfileSchema,
  ProductProfileSchema,
  SnapshotRefSchema,
  type BrandProfile,
  type ProductProfile,
} from "@intentvisible/core-schema";

import type { SnapshotRef } from "../src/generate.js";
import type { CandidateIntent } from "../src/parse.js";
import type { MarketTarget } from "../src/prompt.js";

export const DOMAIN = "www.examplebrand.com.au";
export const PDP_URL = `https://${DOMAIN}/products/example`;
export const SPECS_URL = `https://${DOMAIN}/products/example/specs`;

export const SNAPSHOT: SnapshotRef = SnapshotRefSchema.parse({
  url: PDP_URL,
  content_hash: "sha256:fixture",
  fetched_at: "2026-10-30T00:00:00.000Z",
  storage_ref: `${"a".repeat(64)}.html`,
});

export const SECOND_SNAPSHOT: SnapshotRef = SnapshotRefSchema.parse({
  url: SPECS_URL,
  content_hash: "sha256:fixture-specs",
  fetched_at: "2026-10-30T00:00:00.000Z",
  storage_ref: `${"b".repeat(64)}.html`,
});

export const AU_MARKET: MarketTarget = { country: "AU", language: "en" };

export const BRAND: BrandProfile = BrandProfileSchema.parse({
  schema_version: "1.0.0",
  brand_id: "brand_example",
  name: "ExampleBrand",
  domain: DOMAIN,
  description: "Portable power stations for camping and overlanding.",
  categories: ["portable power station"],
  competitor_brands: ["RivalOne", "RivalTwo"],
  differentiators: ["LiFePO4 cells rated for 3000 cycles"],
  use_cases: ["camping fridge power", "weekend off-grid trips"],
  personas: ["Camper/Overlander"],
  pain_points: ["unrealistic advertised runtime claims"],
  purchase_barriers: ["price", "shipping cost"],
  trust_evidence: ["2-year warranty", "ce/fcc certified"],
  evidence_urls: [PDP_URL],
  snapshot_refs: [SNAPSHOT],
  generation_method: "deterministic_extraction",
});

export const PRODUCT: ProductProfile = ProductProfileSchema.parse({
  schema_version: "1.0.0",
  product_id: "product_example_1000",
  brand_id: "brand_example",
  name: "ExampleBrand 1000 Portable Power Station",
  url: PDP_URL,
  description: "993Wh LiFePO4 portable power station for camping and overlanding.",
  price: { amount: 999, currency: "AUD" },
  features: ["993Wh LiFePO4 battery", "1000W AC inverter", "MPPT solar input"],
  specifications: [{ name: "Capacity", value: "993Wh" }],
  use_cases: ["camping fridge power", "weekend off-grid trips"],
  compatibility: [
    "Compatible with most camping fridges (12V/24V)",
    "Runs a CPAP machine overnight",
  ],
  faqs: [{ question: "How long can it run a camping fridge?", answer: "5-10 hours" }],
  skus: [
    { sku_id: "sku_example_01", name: "ExampleBrand 1000" },
    { sku_id: "sku_example_02", name: "ExampleBrand 1000 bundle" },
  ],
  shipping_and_returns: ["Free AU shipping over $199", "30-day returns"],
  evidence_urls: [PDP_URL, SPECS_URL],
  snapshot_refs: [SNAPSHOT, SECOND_SNAPSHOT],
  generation_method: "deterministic_extraction",
});

/**
 * A well-formed candidate citing the fixture snapshots — the common building
 * block for generate/validate tests. Overrides patch fields on the base.
 */
export function baseCandidate(overrides: Partial<CandidateIntent> = {}): CandidateIntent {
  return {
    intent_name: "Camping Fridge Runtime",
    topic: "camping_fridge_runtime",
    buyer_stage: "Solution Research",
    intent_category: "Technical",
    persona: "Camper/Overlander",
    pain_point: "Need realistic runtime for a camping fridge",
    prompts: ["Which portable power station can run a camping fridge overnight?"],
    recommended_content: "Runtime guide with appliance assumptions",
    recommended_cta: "Check compatible models",
    // Brand-neutral default: brand-scope candidates may not carry SKUs.
    sku_ids: [],
    evidence_urls: [PDP_URL],
    confidence: "medium",
    ...overrides,
  } as CandidateIntent;
}

/** JSON array of candidates — the fixture shape of a recorded model response. */
export function candidatesJson(candidates: readonly CandidateIntent[]): string {
  return JSON.stringify(candidates);
}
