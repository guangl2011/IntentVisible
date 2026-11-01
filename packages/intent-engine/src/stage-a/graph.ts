/**
 * Stage A output assembly: the versioned MarketingGraph JSON (schema from
 * core-schema v2). Pure and deterministic — same validated parts, same
 * graph — with stable ids minted collision-guardedly (persona_, scenario_,
 * int_, graph_ patterns from primitives-v2) and every node carrying its
 * data_mode + provenance. The final gate is MarketingGraphSchema.parse
 * itself: a graph that does not satisfy the v2 schema cannot leave Stage A
 * (blueprint validation family 3).
 */

import type { z } from "zod";

import { MarketingGraphSchema, SCENARIO_TYPES, type DemandEstimate } from "@intentvisible/core-schema";

import { slugify } from "../slug.js";
import type { ResolvedEntity, ModeledPersona, ModeledIntentTopic } from "./modeling.js";
import type { SpotCheckResult } from "./spot-check.js";
import { derivePriorityTier } from "./scoring.js";
import type { StageADropEvent } from "./evidence.js";

/** The v2 schema version string Stage A stamps on every node and the graph. */
export const STAGE_A_SCHEMA_VERSION = "2.0.0";

/** Competitor node cap (the graph schema keeps the same structural cap). */
const COMPETITOR_NODE_CAP = 10;

/** Collision-guarded stable id, generic over the node prefix (dedup.ts pattern). */
export function freshStableId(prefix: string, idMaterial: string, usedIds: ReadonlySet<string>): string {
  const base = slugify(idMaterial) || "unnamed";
  const candidate = `${prefix}_${base}`;
  if (!usedIds.has(candidate)) {
    return candidate;
  }
  for (let n = 2; n < 100; n += 1) {
    const suffixed = `${prefix}_${base.slice(0, 100 - String(n).length - 1)}_${n}`;
    if (!usedIds.has(suffixed)) {
      return suffixed;
    }
  }
  throw new Error(`could not derive a unique ${prefix}_ id for "${idMaterial}"`);
}

export interface ScoredTopicParts {
  topic: ModeledIntentTopic;
  /** Tier-only demand estimate for the topic's primary keyword (Stage A.3). */
  volume: DemandEstimate;
}

export interface StageAGraphParts {
  brandId: string;
  brandName: string;
  graphVersion: number;
  generatedAt: string;
  /** Provenance source for graph-level and entity-derived nodes (the A.1 model). */
  entityModel: string;
  /** Provenance source for the A.2 persona/topic modeling. */
  modelingModel: string;
  entity: ResolvedEntity;
  spotCheck: SpotCheckResult;
  personas: ModeledPersona[];
  scoredTopics: ScoredTopicParts[];
}

export type MarketingGraph = z.output<typeof MarketingGraphSchema>;

/**
 * Assembles the Marketing Graph. Competitor identity is the normalized
 * name — same-name proposals are duplicates, the monitored brand itself is
 * excluded, and the set is capped at 10 (blueprint Stage A.1: 5–10).
 * Persona/scenario/intent ids are minted in node order with the collision
 * guard, so identical inputs produce identical graphs.
 */
export function buildMarketingGraph(parts: StageAGraphParts): {
  graph: MarketingGraph;
  dropped: StageADropEvent[];
} {
  const dropped: StageADropEvent[] = [];
  const provenance = { source: parts.entityModel, retrieved_at: parts.generatedAt };
  const modelingProvenance = { source: parts.modelingModel, retrieved_at: parts.generatedAt };

  // --- personas & scenarios (scenario ids minted from archetype + type) ---
  const usedPersonaIds = new Set<string>();
  const usedScenarioIds = new Set<string>();
  const personas: MarketingGraph["personas"] = [];
  const scenarios: MarketingGraph["scenarios"] = [];
  for (const persona of parts.personas) {
    const personaId = freshStableId("persona", persona.archetype, usedPersonaIds);
    usedPersonaIds.add(personaId);
    personas.push({
      schema_version: STAGE_A_SCHEMA_VERSION,
      persona_id: personaId,
      brand_id: parts.brandId,
      archetype: persona.archetype,
      demographics: persona.demographics,
      core_frustrations: persona.core_frustrations,
      cognitive_biases: persona.cognitive_biases,
      decision_triggers: persona.decision_triggers,
      ai_language_fingerprint: persona.ai_language_fingerprint,
      data_mode: "llm_estimated",
      provenance: modelingProvenance,
      generated_at: parts.generatedAt,
    });
    // Scenarios emit in canonical type order, one per type (MECE).
    for (const scenarioType of SCENARIO_TYPES) {
      const scenario = persona.scenarios.find((s) => s.scenario_type === scenarioType);
      if (!scenario) {
        continue;
      }
      scenarios.push({
        schema_version: STAGE_A_SCHEMA_VERSION,
        scenario_id: freshStableId(
          "scenario",
          `${persona.archetype}_${scenarioType}`,
          usedScenarioIds,
        ),
        persona_id: personaId,
        brand_id: parts.brandId,
        scenario_type: scenarioType,
        description: scenario.description,
        data_mode: "llm_estimated",
        provenance: modelingProvenance,
        generated_at: parts.generatedAt,
      });
    }
  }

  // --- competitors: dedup by normalized name, self-exclusion, 10-node cap ---
  const usedCompetitorIds = new Set<string>();
  const competitors: MarketingGraph["competitors"] = [];
  for (const competitor of parts.entity.competitors) {
    const competitorId = `brand_${slugify(competitor.name) || "unnamed"}`;
    if (competitorId === parts.brandId) {
      dropped.push({
        subject: `competitors (${competitor.name})`,
        reason: "self_competitor",
        detail: "the model proposed the monitored brand as its own competitor",
      });
      continue;
    }
    if (usedCompetitorIds.has(competitorId)) {
      dropped.push({
        subject: `competitors (${competitor.name})`,
        reason: "duplicate",
        detail: "a competitor with the same normalized name was already accepted",
      });
      continue;
    }
    if (competitors.length >= COMPETITOR_NODE_CAP) {
      dropped.push({
        subject: `competitors (${competitor.name})`,
        reason: "capacity",
        detail: "the competitor set exceeded the 10-node graph cap",
      });
      continue;
    }
    usedCompetitorIds.add(competitorId);
    competitors.push({
      brand_id: competitorId,
      name: competitor.name,
      relation: competitor.relation,
      claims: competitor.claims,
      evidence_urls: competitor.evidence_urls,
      data_mode: "llm_estimated",
      provenance,
    });
  }

  // --- intent topics: three raw dimensions + the derived tier ---
  const usedIntentIds = new Set<string>();
  const intentTopics: MarketingGraph["intent_topics"] = parts.scoredTopics.map((scored) => {
    const { topic, volume } = scored;
    const priority = derivePriorityTier({
      volume_tier: volume.tier,
      fit_score: topic.fit.score,
      void_rate_pct: parts.spotCheck.void_rate_pct,
    });
    return {
      intent_id: freshStableId("int", topic.intent_name, usedIntentIds),
      intent_name: topic.intent_name,
      buyer_stage: topic.buyer_stage,
      intent_category: topic.intent_category,
      volume,
      fit: {
        score: topic.fit.score,
        ...(topic.fit.mismatch_reason === undefined
          ? {}
          : { mismatch_reason: topic.fit.mismatch_reason }),
        data_mode: "llm_estimated",
        provenance: modelingProvenance,
      },
      gap: {
        void_rate_pct: parts.spotCheck.void_rate_pct,
        data_mode: "llm_simulated",
        provenance: { source: parts.spotCheck.platform, retrieved_at: parts.generatedAt },
      },
      priority,
      evidence_urls: topic.evidence_urls,
    };
  });

  const graph = MarketingGraphSchema.parse({
    schema_version: STAGE_A_SCHEMA_VERSION,
    graph_id: `graph_${slugify(parts.brandName) || "unnamed"}`,
    graph_version: parts.graphVersion,
    brand_id: parts.brandId,
    business_model: parts.entity.business_model,
    value_proposition: parts.entity.value_proposition,
    moats: parts.entity.moats,
    competitors,
    personas,
    scenarios,
    intent_topics: intentTopics,
    data_mode: "llm_estimated",
    provenance,
    generated_at: parts.generatedAt,
  });

  return { graph, dropped };
}
