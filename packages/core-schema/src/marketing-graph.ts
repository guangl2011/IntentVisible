import { z } from "zod";

import {
  BUSINESS_MODELS,
  BUYER_STAGES_V2,
  COMPETITOR_RELATIONS,
  DATA_MODES,
  DEMAND_TIERS,
  INTENT_CATEGORIES_V2,
  PRIORITY_TIERS,
} from "./enums-v2.js";
import { PersonaRecordSchema } from "./persona.js";
import {
  BrandIdSchema,
  EvidenceUrlsSchema,
  IntentIdSchema,
  IsoDateTimeSchema,
} from "./primitives.js";
import {
  GraphIdSchema,
  ProvenanceSchema,
  SchemaVersionV2Schema,
  TraitSchema,
} from "./primitives-v2.js";
import { ScenarioRecordSchema } from "./scenario.js";

/**
 * Stage A outputs composed into the Marketing Graph (blueprint "Output:
 * the Marketing Graph"): brand node, competitor nodes, persona nodes,
 * scenario edges, and intent-topic nodes carrying the three raw scoring
 * dimensions. The graph is the single artifact Gate 1 confirms and Stage
 * B's only input.
 *
 * The Zod schema composes PersonaRecordSchema/ScenarioRecordSchema
 * directly — one runtime source for persona/scenario shape. The JSON
 * Schema file duplicates the persona/scenario defs (self-contained files,
 * v1 pattern); contract tests keep the copies in lockstep.
 */

/** Demand dimension (Stage A.3): tiers only in lightweight mode — an LLM volume guess is never presented as a number. */
export const DemandEstimateSchema = z
  .strictObject({
    keyword: z.string().min(1).max(200),
    tier: z.enum(DEMAND_TIERS),
    /** Present only when a measured provider filled it; always null in lightweight mode. */
    monthly_volume: z.number().int().min(0).nullable(),
    data_mode: z.enum(DATA_MODES),
    provenance: ProvenanceSchema,
  })
  .superRefine((estimate, ctx) => {
    if (estimate.data_mode !== "provider_measured" && estimate.monthly_volume !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["monthly_volume"],
        message:
          'a monthly_volume requires data_mode "provider_measured" — LLM estimates are consumed as tiers only',
      });
    }
  });

/** Fit dimension (Stage A.4): LLM-scored 0–1 against the value proposition, with the mismatch named below 0.5. */
export const FitEstimateSchema = z
  .strictObject({
    score: z.number().min(0).max(1),
    mismatch_reason: z.string().min(1).max(500).optional(),
    data_mode: z.enum(DATA_MODES),
    provenance: ProvenanceSchema,
  })
  .superRefine((fit, ctx) => {
    if (fit.score < 0.5 && fit.mismatch_reason === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["mismatch_reason"],
        message: "a fit score below 0.5 must name the mismatch (blueprint Stage A.4)",
      });
    }
  });

/** Gap dimension (Stage A.4): from the simulated spot check — the share of answers recommending no monitored competitor. */
export const GapEstimateSchema = z.strictObject({
  void_rate_pct: z.number().min(0).max(100),
  data_mode: z.enum(DATA_MODES),
  provenance: ProvenanceSchema,
});

export const CompetitorNodeSchema = z.strictObject({
  brand_id: BrandIdSchema,
  name: z.string().min(1).max(200),
  relation: z.enum(COMPETITOR_RELATIONS),
  /** Competitor claims cite the site's own comparison content or are flagged as assumptions. */
  claims: z.array(TraitSchema).max(20),
  evidence_urls: EvidenceUrlsSchema,
  data_mode: z.enum(DATA_MODES),
  provenance: ProvenanceSchema,
});

export const IntentTopicNodeSchema = z.strictObject({
  intent_id: IntentIdSchema,
  intent_name: z.string().min(1).max(200),
  buyer_stage: z.enum(BUYER_STAGES_V2),
  intent_category: z.enum(INTENT_CATEGORIES_V2),
  volume: DemandEstimateSchema,
  fit: FitEstimateSchema,
  gap: GapEstimateSchema,
  /** Derived from the three dimensions, never authored (blueprint Stage A.4). */
  priority: z.enum(PRIORITY_TIERS),
  evidence_urls: EvidenceUrlsSchema,
});

export const MarketingGraphSchema = z
  .strictObject({
    schema_version: SchemaVersionV2Schema,
    graph_id: GraphIdSchema,
    /** Bumped when a cycle (or a Gate 1 edit) regenerates the graph. */
    graph_version: z.number().int().min(1),
    brand_id: BrandIdSchema,
    business_model: z.enum(BUSINESS_MODELS),
    value_proposition: TraitSchema,
    /** Ingredient/technical moats (Stage A.1). */
    moats: z.array(TraitSchema).max(20),
    /** 5–10 direct + indirect competitors in the pipeline; schema keeps loose structural caps. */
    competitors: z.array(CompetitorNodeSchema).max(10),
    /** 3–4 MECE personas in the pipeline; schema keeps loose caps so Gate 1 edits stay valid. */
    personas: z.array(PersonaRecordSchema).min(1).max(10),
    scenarios: z.array(ScenarioRecordSchema).max(30),
    intent_topics: z.array(IntentTopicNodeSchema).max(100),
    /**
     * Mode of the graph-generation pass (modeling + estimation). Dimension
     * nodes carry their own data_mode — a graph may legitimately mix an
     * llm_estimated volume with an llm_simulated gap, and no measurement
     * (provider_measured) exists anywhere in a lightweight graph.
     */
    data_mode: z.enum(DATA_MODES),
    provenance: ProvenanceSchema,
    generated_at: IsoDateTimeSchema.optional(),
  })
  .superRefine((graph, ctx) => {
    // Scenarios are edges: persona_id must resolve to a graph persona.
    const personaIds = new Set(graph.personas.map((persona) => persona.persona_id));
    graph.scenarios.forEach((scenario, index) => {
      if (!personaIds.has(scenario.persona_id)) {
        ctx.addIssue({
          code: "custom",
          path: ["scenarios", index, "persona_id"],
          message: `scenario references unknown persona_id ${scenario.persona_id}`,
        });
      }
    });

    // One node per id — a duplicated persona/scenario/competitor/intent is
    // a generation bug, and dedup caps the competitor set (Stage A.1).
    const assertUnique = (
      values: string[],
      path: (string | number)[],
      message: string,
    ): void => {
      if (new Set(values).size !== values.length) {
        ctx.addIssue({ code: "custom", path, message });
      }
    };
    assertUnique(
      graph.personas.map((persona) => persona.persona_id),
      ["personas"],
      "persona_id must be unique within the graph",
    );
    assertUnique(
      graph.scenarios.map((scenario) => scenario.scenario_id),
      ["scenarios"],
      "scenario_id must be unique within the graph",
    );
    assertUnique(
      graph.competitors.map((competitor) => competitor.brand_id),
      ["competitors"],
      "competitor brand_id must be unique within the graph",
    );
    assertUnique(
      graph.intent_topics.map((topic) => topic.intent_id),
      ["intent_topics"],
      "intent_id must be unique within the graph",
    );

    // The brand never competes with itself.
    graph.competitors.forEach((competitor, index) => {
      if (competitor.brand_id === graph.brand_id) {
        ctx.addIssue({
          code: "custom",
          path: ["competitors", index, "brand_id"],
          message: "the monitored brand cannot be its own competitor",
        });
      }
    });
  });
