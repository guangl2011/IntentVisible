import { z } from "zod";

import { DATA_MODES } from "./enums-v2.js";
import { BrandIdSchema, IsoDateTimeSchema } from "./primitives.js";
import {
  PersonaIdSchema,
  ProvenanceSchema,
  SchemaVersionV2Schema,
  TraitSchema,
} from "./primitives-v2.js";

/**
 * Persona node (blueprint Stage A.2): one of the 3–4 MECE personas, with
 * the six standard fields (PSI Skill §2). Every field is a claim about the
 * buyer — each cites snapshot evidence via its Trait or is explicitly
 * flagged as an assumption; prompts in Stage B reference persona_id so
 * metrics can be cut by persona.
 */
export const PersonaRecordSchema = z.strictObject({
  schema_version: SchemaVersionV2Schema,
  persona_id: PersonaIdSchema,
  brand_id: BrandIdSchema,
  // --- the six standard fields ---
  archetype: z.string().min(1).max(200),
  demographics: TraitSchema,
  core_frustrations: z.array(TraitSchema).min(1).max(20),
  cognitive_biases: z.array(TraitSchema).min(1).max(20),
  decision_triggers: z.array(TraitSchema).min(1).max(20),
  ai_language_fingerprint: TraitSchema,
  // --- data-mode provenance (blueprint validation family 2) ---
  data_mode: z.enum(DATA_MODES),
  provenance: ProvenanceSchema,
  generated_at: IsoDateTimeSchema.optional(),
});
