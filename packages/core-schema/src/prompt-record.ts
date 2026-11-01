import { z } from "zod";

import { BUYER_STAGES_V2, DATA_MODES, INTENT_CATEGORIES_V2, PROMPT_STATUSES } from "./enums-v2.js";
import {
  BrandIdSchema,
  CountryCodeSchema,
  EvidenceUrlsSchema,
  IntentIdSchema,
  LanguageCodeSchema,
} from "./primitives.js";
import {
  PersonaIdSchema,
  PromptIdSchema,
  ProvenanceSchema,
  ScenarioIdSchema,
  SchemaVersionV2Schema,
} from "./primitives-v2.js";

/**
 * One monitoring prompt (blueprint Stage B.2): a first-person buyer-voiced
 * expansion of a selected intent, grounded in the Marketing Graph — every
 * prompt must restate at least one graph claim that cites evidence or is
 * flagged as an assumption (evidence_urls; prompts inventing product facts
 * are dropped by validation). Field shapes follow the blueprint's
 * PromptRecord, plus the required data_mode/provenance provenance block.
 */
export const PromptRecordSchema = z.strictObject({
  schema_version: SchemaVersionV2Schema,
  prompt_id: PromptIdSchema,
  intent_id: IntentIdSchema, // links back to the graph / lib
  persona_id: PersonaIdSchema,
  scenario_id: ScenarioIdSchema,
  text: z.string().min(10).max(1000), // the buyer's actual AI-search phrasing
  buyer_stage: z.enum(BUYER_STAGES_V2),
  intent_category: z.enum(INTENT_CATEGORIES_V2),
  language: LanguageCodeSchema, // defaults from onboarding
  country: CountryCodeSchema, // defaults from onboarding (USA)
  brand_id: BrandIdSchema,
  competitors: z.array(BrandIdSchema).max(10), // monitored for this prompt
  evidence_urls: EvidenceUrlsSchema, // graph claims the prompt encodes
  status: z.enum(PROMPT_STATUSES),
  data_mode: z.enum(DATA_MODES),
  provenance: ProvenanceSchema,
});
