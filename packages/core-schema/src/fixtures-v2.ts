/**
 * Shared v2 test fixtures (Pipeline v2 blueprint). All values are
 * placeholder data — nothing here is measured; provenance sources name the
 * simulated/estimated origin (e.g. "gemini-2.5-pro"), never a real
 * provider call.
 */

import type { z } from "zod";

/** Convenience: the parsed (Zod-output) shape of a fixture after validation. */
export type Parsed<S extends z.ZodType> = z.output<S>;

export const V2_TIMESTAMP = "2026-11-01T00:00:00Z";
export const V2_PROVENANCE = { source: "gemini-2.5-pro", retrieved_at: V2_TIMESTAMP };

export const examplePersona: Record<string, unknown> = {
  schema_version: "2.0.0",
  persona_id: "persona_weekend_camper",
  brand_id: "brand_solix",
  archetype: "Weekend Camper",
  demographics: {
    text: "Ages 28-45, suburban households taking 3-6 short trips a year",
    assumption: true,
    evidence_urls: [],
  },
  core_frustrations: [
    {
      text: "Cannot tell which power station wins on capacity and runtime",
      assumption: false,
      evidence_urls: ["https://www.example.com/compare/s2000-vs-rivals"],
    },
  ],
  cognitive_biases: [
    {
      text: "Anchors on the largest watt-hour figure on the spec sheet",
      assumption: true,
      evidence_urls: [],
    },
  ],
  decision_triggers: [
    {
      text: "A booked camping trip within 30 days",
      assumption: true,
      evidence_urls: [],
    },
  ],
  ai_language_fingerprint: {
    text: "Asks which portable power station can run a camping fridge overnight",
    assumption: false,
    evidence_urls: ["https://www.example.com/camping-power"],
  },
  data_mode: "llm_estimated",
  provenance: V2_PROVENANCE,
};

export const exampleSecondPersona: Record<string, unknown> = {
  ...examplePersona,
  persona_id: "persona_rv_family",
  archetype: "RV Family",
};

export const exampleScenario: Record<string, unknown> = {
  schema_version: "2.0.0",
  scenario_id: "scenario_weekend_trip_planning",
  persona_id: "persona_weekend_camper",
  brand_id: "brand_solix",
  scenario_type: "daily_pain",
  description: {
    text: "Planning a weekend trip and unsure what capacity covers a fridge plus lights",
    assumption: false,
    evidence_urls: ["https://www.example.com/camping-power"],
  },
  data_mode: "llm_estimated",
  provenance: V2_PROVENANCE,
};

export const examplePromptRecord: Record<string, unknown> = {
  schema_version: "2.0.0",
  prompt_id: "prompt_fridge_runtime_overnight",
  intent_id: "int_camping_fridge_runtime",
  persona_id: "persona_weekend_camper",
  scenario_id: "scenario_weekend_trip_planning",
  text: "Which portable power station can run my camping fridge for two nights?",
  buyer_stage: "Solution Research",
  intent_category: "Technical",
  language: "en",
  country: "US",
  brand_id: "brand_solix",
  competitors: ["brand_ecoflow", "brand_jackery"],
  evidence_urls: ["https://www.example.com/products/s2000"],
  status: "draft",
  data_mode: "llm_simulated",
  provenance: V2_PROVENANCE,
};

export const exampleMonitoringRun: Record<string, unknown> = {
  schema_version: "2.0.0",
  run_id: "run_baseline_r1_prompt_fridge_01",
  prompt_id: "prompt_fridge_runtime_overnight",
  platform: "perplexity",
  round: 1,
  raw_answer: "For a two-night trip, the Example S2000 covers a 12V fridge with headroom...",
  raw_answer_content_hash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  citations: ["https://www.example.com/products/s2000", "https://rival.example.com/delta2"],
  model_id: "gemini-2.5-pro",
  country: "US",
  language: "en",
  ran_at: V2_TIMESTAMP,
  data_mode: "llm_simulated",
  provenance: V2_PROVENANCE,
};

export const exampleMetricsSnapshot: Record<string, unknown> = {
  schema_version: "2.0.0",
  metrics_id: "mtrc_fridge_runtime_perplexity_r1",
  brand_id: "brand_solix",
  intent_id: "int_camping_fridge_runtime",
  prompt_id: "prompt_fridge_runtime_overnight",
  platform: "perplexity",
  visibility_pct: 42.5,
  top_competitor_id: "brand_ecoflow",
  leader_gap_pct: 17.5,
  void_rate_pct: 8.3,
  sentiment_index: 61.0,
  citation_share: [
    { domain: "example.com", share_pct: 30.0 },
    { domain: "rival.example.com", share_pct: 45.0 },
  ],
  consensus: "stable",
  run_count: 9,
  platforms: ["perplexity"],
  date_range: { from: "2026-10-30T00:00:00Z", to: "2026-10-31T00:00:00Z" },
  provider_model: "gemini-2.5-pro",
  data_mode: "llm_simulated",
  provenance: V2_PROVENANCE,
};

export const exampleCompetitor = (patch: Record<string, unknown>): Record<string, unknown> => ({
  brand_id: "brand_ecoflow",
  name: "EcoFlow",
  relation: "direct",
  claims: [
    {
      text: "Positions itself as the fast-charging market leader",
      assumption: true,
      evidence_urls: [],
    },
  ],
  evidence_urls: ["https://www.example.com/compare/s2000-vs-rivals"],
  data_mode: "llm_estimated",
  provenance: V2_PROVENANCE,
  ...patch,
});

export const exampleIntentTopic: Record<string, unknown> = {
  intent_id: "int_camping_fridge_runtime",
  intent_name: "Camping Fridge Runtime",
  buyer_stage: "Solution Research",
  intent_category: "Technical",
  volume: {
    keyword: "camping fridge power station",
    tier: "high",
    monthly_volume: null,
    data_mode: "llm_estimated",
    provenance: V2_PROVENANCE,
  },
  fit: {
    score: 0.9,
    data_mode: "llm_estimated",
    provenance: V2_PROVENANCE,
  },
  gap: {
    void_rate_pct: 30,
    data_mode: "llm_simulated",
    provenance: V2_PROVENANCE,
  },
  priority: "S",
  evidence_urls: ["https://www.example.com/products/s2000"],
};

/** The single Stage A artifact Gate 1 confirms. */
export const exampleMarketingGraph: Record<string, unknown> = {
  schema_version: "2.0.0",
  graph_id: "graph_solix_2026q4",
  graph_version: 1,
  brand_id: "brand_solix",
  business_model: "dtc",
  value_proposition: {
    text: "Modular portable power with a stated 10-year warranty",
    assumption: false,
    evidence_urls: ["https://www.example.com/about"],
  },
  moats: [
    {
      text: "LiFePO4 cells stated on the product page",
      assumption: false,
      evidence_urls: ["https://www.example.com/products/s2000"],
    },
  ],
  competitors: [
    exampleCompetitor({}),
    exampleCompetitor({ brand_id: "brand_jackery", name: "Jackery" }),
  ],
  personas: [examplePersona, exampleSecondPersona],
  scenarios: [
    exampleScenario,
    {
      ...exampleScenario,
      scenario_id: "scenario_rv_shelf_comparison",
      persona_id: "persona_rv_family",
      scenario_type: "final_shelf_comparison",
    },
  ],
  intent_topics: [
    exampleIntentTopic,
    {
      ...exampleIntentTopic,
      intent_id: "int_solar_panel_compatibility",
      intent_name: "Solar Panel Compatibility",
      buyer_stage: "Vendor Evaluation",
      intent_category: "Implementation",
      fit: {
        score: 0.4,
        mismatch_reason: "Site lists no solar accessories; compatibility claims are absent",
        data_mode: "llm_estimated",
        provenance: V2_PROVENANCE,
      },
      priority: "B",
    },
  ],
  data_mode: "llm_estimated",
  provenance: V2_PROVENANCE,
  generated_at: V2_TIMESTAMP,
};

/**
 * Published intent record as lib publish produces it (Stage C.3): flipped to
 * `simulated` (lightweight tier) with full measurement provenance and the
 * intent version bumped. The not_measured draft variant is derived in tests
 * by resetting the measurement fields.
 */
export const exampleIntentRecordV2: Record<string, unknown> = {
  schema_version: "2.0.0",
  intent_id: "int_camping_fridge_runtime",
  intent_version: 2,
  scope: "brand",
  brand_id: "brand_solix",
  intent_name: "Camping Fridge Runtime",
  buyer_stage: "Solution Research",
  intent_category: "Technical",
  persona: "Weekend Camper",
  pain_point: "Cannot tell which power station runs a camping fridge overnight",
  country: "US",
  language: "en",
  prompts: ["Which portable power station can run my camping fridge for two nights?"],
  sku_ids: [],
  evidence_urls: ["https://www.example.com/products/s2000"],
  generation_method: "llm_with_page_evidence",
  generation_model: "gemini-2.5-pro",
  measurement_status: "simulated",
  measurement_source: "gemini-2.5-pro",
  measurement_provenance: {
    source: "gemini-2.5-pro",
    model_id: "gemini-2.5-pro",
    date_range: { from: V2_TIMESTAMP, to: V2_TIMESTAMP },
  },
  visibility_pct: 42.5,
  monthly_search_volume: null,
  confidence: "high",
  generated_at: V2_TIMESTAMP,
};

/** Deep-clone a v2 fixture for per-test mutation (plain JSON shapes). */
export function cloneFixture(fixture: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(fixture)) as Record<string, unknown>;
}
