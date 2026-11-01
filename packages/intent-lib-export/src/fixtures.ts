/**
 * Deterministic test fixtures for the intent-lib-export package. Every
 * record validates against its core-schema v2 schema at construction, so
 * the renderer is always exercised over shapes the pipeline really emits.
 * All values are placeholder data — nothing is measured; provenance names
 * the simulated/estimated origin, never a real provider call.
 */

import type {
  PersonaRecordSchema,
  ScenarioRecordSchema} from "@intentvisible/core-schema";
import {
  MarketingGraphSchema,
  MetricsSnapshotSchema,
  PromptRecordSchema,
  IntentRecordSchema,
} from "@intentvisible/core-schema";
import type { z } from "zod";

import { buildLibExport } from "./build.js";
import type { BuyerIntentLib, LibExportInput } from "./types.js";

const TIMESTAMP = "2026-11-01T00:00:00Z";
const PROVENANCE = { source: "gemini-2.5-pro", retrieved_at: TIMESTAMP } as const;

type PersonaInput = z.input<typeof PersonaRecordSchema>;
type ScenarioInput = z.input<typeof ScenarioRecordSchema>;
type PromptInput = z.input<typeof PromptRecordSchema>;
type MetricsInput = z.input<typeof MetricsSnapshotSchema>;
type IntentRecordInput = z.input<typeof IntentRecordSchema>;

function persona(overrides: Partial<PersonaInput> & Pick<PersonaInput, "persona_id">): PersonaInput {
  return {
    schema_version: "2.0.0",
    brand_id: "brand_solix",
    archetype: "Weekend Camper",
    demographics: { text: "Ages 28-45, suburban households", assumption: true, evidence_urls: [] },
    core_frustrations: [
      {
        text: "Cannot tell which power station wins on capacity and runtime",
        assumption: false,
        evidence_urls: ["https://www.example.com/compare"],
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
    provenance: PROVENANCE,
    ...overrides,
  };
}

function scenario(
  overrides: Partial<ScenarioInput> & Pick<ScenarioInput, "scenario_id" | "persona_id">,
): ScenarioInput {
  return {
    schema_version: "2.0.0",
    brand_id: "brand_solix",
    scenario_type: "daily_pain",
    description: {
      text: "Planning a weekend trip and unsure what capacity covers a fridge plus lights",
      assumption: false,
      evidence_urls: ["https://www.example.com/camping-power"],
    },
    data_mode: "llm_estimated",
    provenance: PROVENANCE,
    ...overrides,
  };
}

function prompt(overrides: Partial<PromptInput> & Pick<PromptInput, "prompt_id">): PromptInput {
  return {
    schema_version: "2.0.0",
    intent_id: "int_camping_fridge_runtime",
    persona_id: "persona_weekend_camper",
    scenario_id: "scenario_weekend_trip_planning",
    text: `Which portable power station can run my camping fridge for two nights? (${overrides.prompt_id})`,
    buyer_stage: "Solution Research",
    intent_category: "Technical",
    language: "en",
    country: "US",
    brand_id: "brand_solix",
    competitors: ["brand_ecoflow", "brand_jackery"],
    evidence_urls: ["https://www.example.com/products/s2000"],
    status: "confirmed",
    data_mode: "llm_simulated",
    provenance: PROVENANCE,
    ...overrides,
  };
}

type MetricsOverrides = Partial<MetricsInput> & {
  visibility_pct?: number;
  consensus?: "stable" | "noisy";
  platform?: undefined;
};

/** A pooled (platform-absent) per-prompt snapshot — the export's join key. */
function pooledMetrics(
  overrides: MetricsOverrides & Pick<MetricsInput, "metrics_id" | "prompt_id">,
): MetricsInput {
  return {
    schema_version: "2.0.0",
    brand_id: "brand_solix",
    intent_id: "int_camping_fridge_runtime",
    top_competitor_id: "brand_ecoflow",
    leader_gap_pct: 10,
    void_rate_pct: 20,
    sentiment_index: 60,
    citation_share: [],
    consensus: "stable",
    // Callers always override this; 0 defaults to below the export floor.
    visibility_pct: 0,
    run_count: 3,
    platforms: ["chatgpt_search", "perplexity"],
    date_range: { from: TIMESTAMP, to: TIMESTAMP },
    provider_model: "gemini-2.5-pro",
    data_mode: "llm_simulated",
    provenance: PROVENANCE,
    ...overrides,
  };
}

function intentRecord(
  overrides: Partial<IntentRecordInput> & Pick<IntentRecordInput, "intent_id">,
): IntentRecordInput {
  return {
    schema_version: "1.0.0",
    intent_version: 1,
    scope: "product",
    brand_id: "brand_solix",
    intent_name: "Camping fridge runtime",
    buyer_stage: "Solution Research",
    intent_category: "Technical",
    persona: "Weekend Camper",
    pain_point: "Selecting a portable power station that reliably covers fridge runtime",
    country: "US",
    language: "en",
    prompts: ["Which portable power station can run my camping fridge for two nights?"],
    recommended_content: "Comparison page: runtime benchmarks for 12V camping fridges",
    recommended_cta: "See the runtime calculator",
    sku_ids: [],
    evidence_urls: ["https://www.example.com/products/s2000"],
    generation_method: "llm_with_page_evidence",
    measurement_status: "imported",
    measurement_source: "gemini-2.5-pro",
    visibility_pct: 42,
    monthly_search_volume: null,
    confidence: "medium",
    generated_at: TIMESTAMP,
    ...overrides,
  };
}

/** Full Marketing Graph: brand, two competitors, personas, scenarios, two intent topics. */
function graph() {
  return MarketingGraphSchema.parse({
    schema_version: "2.0.0",
    graph_id: "graph_solix_v1",
    graph_version: 1,
    brand_id: "brand_solix",
    business_model: "dtc",
    value_proposition: {
      text: "Longest-lasting portable power for camping",
      assumption: false,
      evidence_urls: ["https://www.example.com/why-solix"],
    },
    moats: [],
    competitors: [
      {
        brand_id: "brand_ecoflow",
        name: "EcoFlow",
        relation: "direct",
        claims: [],
        evidence_urls: ["https://www.example.com/compare/ecoflow"],
        data_mode: "llm_estimated",
        provenance: PROVENANCE,
      },
      {
        brand_id: "brand_jackery",
        name: "Jackery",
        relation: "direct",
        claims: [],
        evidence_urls: ["https://www.example.com/compare/jackery"],
        data_mode: "llm_estimated",
        provenance: PROVENANCE,
      },
    ],
    personas: [
      persona({ persona_id: "persona_weekend_camper" }),
      persona({ persona_id: "persona_rv_family", archetype: "RV Family" }),
    ],
    scenarios: [
      scenario({ scenario_id: "scenario_weekend_trip_planning", persona_id: "persona_weekend_camper" }),
    ],
    intent_topics: [
      {
        intent_id: "int_camping_fridge_runtime",
        intent_name: "Camping fridge runtime",
        buyer_stage: "Solution Research",
        intent_category: "Technical",
        volume: {
          keyword: "camping fridge power station",
          tier: "high",
          monthly_volume: null,
          data_mode: "llm_estimated",
          provenance: PROVENANCE,
        },
        fit: { score: 0.9, data_mode: "llm_estimated", provenance: PROVENANCE },
        gap: { void_rate_pct: 20, data_mode: "llm_simulated", provenance: PROVENANCE },
        priority: "S",
        evidence_urls: ["https://www.example.com/camping-power"],
      },
      {
        intent_id: "int_solar_panel_compatibility",
        intent_name: "Solar panel compatibility",
        buyer_stage: "Vendor Evaluation",
        intent_category: "Technical",
        volume: {
          keyword: "solar panel compatibility",
          tier: "medium",
          monthly_volume: null,
          data_mode: "llm_estimated",
          provenance: PROVENANCE,
        },
        fit: { score: 0.8, data_mode: "llm_estimated", provenance: PROVENANCE },
        gap: { void_rate_pct: 30, data_mode: "llm_simulated", provenance: PROVENANCE },
        priority: "A",
        evidence_urls: ["https://www.example.com/solar"],
      },
    ],
    data_mode: "llm_simulated",
    provenance: PROVENANCE,
  });
}

export interface WorldOverrides {
  visibilityCamping?: number;
  visibilityCampingSecond?: number;
  visibilitySolar?: number;
}

/**
 * The standard test world: two intents, three prompts — two in the camping
 * intent (one Revenue, one Market tier) and one in the solar intent — plus
 * one sub-floor and one noisy prompt that must stay excluded.
 */
export function testInput(overrides: WorldOverrides = {}): LibExportInput {
  return {
    industry: "Portable Power Stations",
    graph: graph(),
    prompts: [
      PromptRecordSchema.parse(
        prompt({ prompt_id: "prompt_fridge_runtime_overnight" }),
      ),
      PromptRecordSchema.parse(
        prompt({
          prompt_id: "prompt_fridge_runtime_weekend",
          text: "What size power station do I need for a two-night camping trip with a 12V fridge?",
        }),
      ),
      PromptRecordSchema.parse(
        prompt({
          prompt_id: "prompt_solar_panel_pairing",
          intent_id: "int_solar_panel_compatibility",
          scenario_id: "scenario_weekend_trip_planning",
          text: "Which solar panels pair with the Solix S2000 for off-grid charging?",
          buyer_stage: "Vendor Evaluation",
        }),
      ),
      PromptRecordSchema.parse(
        prompt({
          prompt_id: "prompt_subfloor",
          text: "Sub-floor prompt that must never appear in an export",
        }),
      ),
      PromptRecordSchema.parse(
        prompt({
          prompt_id: "prompt_noisy",
          text: "Noisy-baseline prompt whose number is not published",
        }),
      ),
    ],
    metrics: [
      MetricsSnapshotSchema.parse(
        pooledMetrics({
          metrics_id: "mtrc_camping_pooled_r1",
          prompt_id: "prompt_fridge_runtime_overnight",
          visibility_pct: overrides.visibilityCamping ?? 84,
        }),
      ),
      MetricsSnapshotSchema.parse(
        pooledMetrics({
          metrics_id: "mtrc_camping_pooled_r2",
          prompt_id: "prompt_fridge_runtime_weekend",
          visibility_pct: overrides.visibilityCampingSecond ?? 42,
        }),
      ),
      MetricsSnapshotSchema.parse(
        pooledMetrics({
          metrics_id: "mtrc_solar_pooled_r1",
          prompt_id: "prompt_solar_panel_pairing",
          intent_id: "int_solar_panel_compatibility",
          visibility_pct: overrides.visibilitySolar ?? 35,
        }),
      ),
      MetricsSnapshotSchema.parse(
        pooledMetrics({
          metrics_id: "mtrc_subfloor_pooled_r1",
          prompt_id: "prompt_subfloor",
          visibility_pct: 24,
        }),
      ),
      MetricsSnapshotSchema.parse(
        pooledMetrics({
          metrics_id: "mtrc_noisy_pooled_r1",
          prompt_id: "prompt_noisy",
          consensus: "noisy",
          visibility_pct: 70,
        }),
      ),
    ],
    intentRecords: [
      IntentRecordSchema.parse(
        intentRecord({ intent_id: "int_camping_fridge_runtime" }),
      ),
      IntentRecordSchema.parse(
        intentRecord({
          intent_id: "int_solar_panel_compatibility",
          intent_name: "Solar panel compatibility",
          recommended_content: "Compatibility matrix: panels and stations",
          recommended_cta: "Check panel compatibility",
        }),
      ),
    ],
  };
}

/** The built lib for the standard test world. */
export function testLib(overrides: WorldOverrides = {}): BuyerIntentLib {
  return buildLibExport(testInput(overrides));
}
