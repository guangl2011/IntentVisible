import { z } from "zod";

import {
  BUYER_STAGES,
  CONFIDENCE_LEVELS,
  GENERATION_METHODS,
  INTENT_CATEGORIES,
  MEASUREMENT_STATUSES,
  OPPORTUNITY_TYPES,
  SCOPES,
} from "./enums.js";
import {
  BrandIdSchema,
  CountryCodeSchema,
  EvidenceUrlsSchema,
  IntentIdSchema,
  IsoDateTimeSchema,
  LanguageCodeSchema,
  SchemaVersionSchema,
  SkuIdSchema,
} from "./primitives.js";

/**
 * Canonical buyer-intent record (spec Data contract; plan sections 2.1 and 4.1).
 *
 * The superRefinement is the standalone-mode boundary invariant: a
 * not_measured record cannot carry measured values. The engine has no code
 * path that constructs measured fields for standalone generation, and this
 * validator rejects any record that sets them, so fabrication presented as
 * measurement cannot pass validation.
 */
export const IntentRecordSchema = z
  .strictObject({
    schema_version: SchemaVersionSchema,
    intent_id: IntentIdSchema,
    intent_version: z.number().int().min(1),
    scope: z.enum(SCOPES),
    brand_id: BrandIdSchema,
    intent_name: z.string().min(1).max(200),
    buyer_stage: z.enum(BUYER_STAGES),
    intent_category: z.enum(INTENT_CATEGORIES),
    persona: z.string().min(1).max(200).optional(),
    pain_point: z.string().min(1).max(500).optional(),
    country: CountryCodeSchema,
    language: LanguageCodeSchema,
    prompts: z.array(z.string().min(1).max(1000)).min(1).max(50),
    recommended_content: z.string().min(1).max(500).optional(),
    recommended_cta: z.string().min(1).max(200).optional(),
    sku_ids: z.array(SkuIdSchema).max(100),
    evidence_urls: EvidenceUrlsSchema,
    generation_method: z.enum(GENERATION_METHODS),
    generation_model: z.string().min(1).max(200).optional(),
    measurement_status: z.enum(MEASUREMENT_STATUSES),
    measurement_source: z.string().min(1).max(200).nullable(),
    visibility_pct: z.number().min(0).max(100).nullable(),
    monthly_search_volume: z.number().int().min(0).nullable(),
    confidence: z.enum(CONFIDENCE_LEVELS),
    opportunity_type: z.enum(OPPORTUNITY_TYPES).optional(),
    generated_at: IsoDateTimeSchema.optional(),
  })
  .superRefine((record, ctx) => {
    if (record.measurement_status !== "not_measured") {
      return;
    }
    const measuredFields = [
      ["visibility_pct", record.visibility_pct],
      ["monthly_search_volume", record.monthly_search_volume],
      ["measurement_source", record.measurement_source],
    ] as const;
    for (const [field, value] of measuredFields) {
      if (value !== null) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `measurement_status "not_measured" requires ${field} to be null: standalone mode cannot emit measured values (spec boundary invariant)`,
        });
      }
    }
  });
