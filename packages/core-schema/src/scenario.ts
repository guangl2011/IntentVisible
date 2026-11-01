import { z } from "zod";

import { DATA_MODES, SCENARIO_TYPES } from "./enums-v2.js";
import { BrandIdSchema, IsoDateTimeSchema } from "./primitives.js";
import {
  PersonaIdSchema,
  ProvenanceSchema,
  ScenarioIdSchema,
  SchemaVersionV2Schema,
  TraitSchema,
} from "./primitives-v2.js";

/**
 * Scenario node (blueprint Stage A.2): one of the three MECE scenario types
 * mapped for a persona (daily pain, acute trigger, final-shelf comparison).
 * Scenarios are graph edges — persona_id must resolve inside the Marketing
 * Graph that embeds them (enforced by the graph's referential-integrity
 * refinement, not here: a standalone scenario record cannot check it).
 */
export const ScenarioRecordSchema = z.strictObject({
  schema_version: SchemaVersionV2Schema,
  scenario_id: ScenarioIdSchema,
  persona_id: PersonaIdSchema,
  brand_id: BrandIdSchema,
  scenario_type: z.enum(SCENARIO_TYPES),
  description: TraitSchema,
  data_mode: z.enum(DATA_MODES),
  provenance: ProvenanceSchema,
  generated_at: IsoDateTimeSchema.optional(),
});
