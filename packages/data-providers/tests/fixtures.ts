/**
 * Shared test fixtures: recorded-style LLM output — the same shape a live
 * Gemini call would return. No test in this package touches the network.
 */

import { DemandEstimateSchema, PromptRecordSchema, type PromptRecord } from "@intentvisible/core-schema";

import type { KeywordVolume } from "../src/keywords.js";

export const KEYWORD_A = "best portable power station";
export const KEYWORD_B = "lifepo4 camping battery";

/** Recorded demand-tier estimate response for {KEYWORD_A, KEYWORD_B}. */
export const TIER_RESPONSE_JSON = JSON.stringify({
  results: [
    { keyword: KEYWORD_A, tier: "high" },
    { keyword: KEYWORD_B, tier: "medium" },
  ],
});

export const TIER_RESPONSE_TEXT = TIER_RESPONSE_JSON;

/** A fenced variant — the model sometimes wraps JSON despite instructions. */
export const TIER_RESPONSE_FENCED = "```json\n" + TIER_RESPONSE_JSON + "\n```";

/** Recorded Perplexity-persona answer (cited, list-forward). */
export const PERPLEXITY_ANSWER = [
  "For a camping trip, the EcoFlow Delta 2 is the strongest all-around pick [1].",
  "If budget matters, the Jackery Explorer 500 remains popular [2].",
  "See also the independent safety notes at https://www.outdoorlab.org/lifepo4-safety.",
  "",
  "[1] https://www.example-reviews.com/eflow-delta-2",
  "[2] https://www.example-reviews.com/jackery-500,",
].join("\n");

export const FIXTURE_ISO_TIME = "2026-11-01T00:00:00.000Z";

export const FIXTURE_PROMPT_TEXT = "what should I look for in a portable power station for camping?";

export function fixturePrompt(overrides: Partial<PromptRecord> = {}): PromptRecord {
  return PromptRecordSchema.parse({
    schema_version: "2.0.0",
    prompt_id: "prompt_fixture",
    intent_id: "int_example",
    persona_id: "persona_camping_overlander",
    scenario_id: "scenario_off_grid_power",
    text: FIXTURE_PROMPT_TEXT,
    buyer_stage: "Solution Research",
    intent_category: "Solution Research",
    language: "en",
    country: "US",
    brand_id: "brand_example",
    competitors: ["brand_rival_one", "brand_rival_two"],
    evidence_urls: ["https://www.examplebrand.com/products/example"],
    status: "confirmed",
    data_mode: "llm_estimated",
    provenance: { source: "fixture", retrieved_at: FIXTURE_ISO_TIME },
    ...overrides,
  });
}

/** LLM-estimated entries the fixture provider serves (tier-only, volume null). */
export function simulatedKeywordVolumes(): KeywordVolume[] {
  return [
    KEYWORD_A,
    KEYWORD_B,
  ].map((keyword, index) =>
    DemandEstimateSchema.parse({
      keyword,
      tier: index === 0 ? "high" : "medium",
      monthly_volume: null,
      data_mode: "llm_estimated",
      provenance: { source: "gemini-2.5-pro", retrieved_at: FIXTURE_ISO_TIME },
    }),
  );
}

/** Measured entries a DataForSEO-style advanced provider would serve. */
export function measuredKeywordVolumes(): KeywordVolume[] {
  return [
    KEYWORD_A,
    KEYWORD_B,
  ].map((keyword, index) =>
    DemandEstimateSchema.parse({
      keyword,
      tier: index === 0 ? "high" : "low",
      monthly_volume: index === 0 ? 5400 : 720,
      data_mode: "provider_measured",
      provenance: { source: "dataforseo", retrieved_at: FIXTURE_ISO_TIME },
    }),
  );
}
