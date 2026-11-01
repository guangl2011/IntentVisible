import { z } from "zod";

import { BUYER_STAGES_V2, INTENT_CATEGORIES_V2, MEASUREMENT_STATUSES_V2 } from "./enums-v2.js";
import {
  BrandIdSchema,
  CountryCodeSchema,
  EvidenceUrlsSchema,
  IntentIdSchema,
  IsoDateTimeSchema,
  LanguageCodeSchema,
  SkuIdSchema,
} from "./primitives.js";
import { SchemaVersionV2Schema } from "./primitives-v2.js";

/**
 * Canonical v2 buyer-intent record (blueprint Stage C.3 lib publish): the
 * v1 record's fields under the v2 vocabulary, with the measurement status
 * extended to "simulated" (lightweight tier) alongside "measured" (advanced
 * tier). Lib publish flips matching intent records to one of the two with
 * full measurement provenance (source, model_id, date range) and bumps the
 * intent version.
 *
 * The v1 standalone-mode invariant is preserved and sharpened:
 *   - a `not_measured` record carries no measurement values and no
 *     measurement provenance;
 *   - a `simulated`/`measured` record always carries its measurement
 *     provenance and a non-null visibility — a number without its
 *     provenance fails validation, never downstream.
 */

/** Publish provenance: where the measurement came from and over what period. */
export const MeasurementProvenanceSchema = z
  .strictObject({
    source: z.string().min(1).max(200),
    /** Provider/model that produced the underlying monitoring answers. */
    model_id: z.string().min(1).max(200),
    date_range: z.strictObject({
      from: IsoDateTimeSchema,
      to: IsoDateTimeSchema,
    }),
  })
  .superRefine((provenance, ctx) => {
    const from = new Date(provenance.date_range.from).getTime();
    const to = new Date(provenance.date_range.to).getTime();
    if (from > to) {
      ctx.addIssue({
        code: "custom",
        path: ["date_range"],
        message: "date_range.from must not be after date_range.to",
      });
    }
  });

export const IntentRecordV2Schema = z
  .strictObject({
    schema_version: SchemaVersionV2Schema,
    intent_id: IntentIdSchema,
    intent_version: z.number().int().min(1),
    scope: z.enum(["brand", "product"]),
    brand_id: BrandIdSchema,
    intent_name: z.string().min(1).max(200),
    buyer_stage: z.enum(BUYER_STAGES_V2),
    intent_category: z.enum(INTENT_CATEGORIES_V2),
    persona: z.string().min(1).max(200).optional(),
    pain_point: z.string().min(1).max(500).optional(),
    country: CountryCodeSchema,
    language: LanguageCodeSchema,
    prompts: z.array(z.string().min(1).max(1000)).min(1).max(50),
    recommended_content: z.string().min(1).max(500).optional(),
    recommended_cta: z.string().min(1).max(200).optional(),
    sku_ids: z.array(SkuIdSchema).max(100),
    evidence_urls: EvidenceUrlsSchema,
    generation_method: z.enum(["llm_with_page_evidence", "deterministic_extraction", "imported"]),
    generation_model: z.string().min(1).max(200).optional(),
    measurement_status: z.enum(MEASUREMENT_STATUSES_V2),
    measurement_source: z.string().min(1).max(200).nullable(),
    measurement_provenance: MeasurementProvenanceSchema.optional(),
    visibility_pct: z.number().min(0).max(100).nullable(),
    monthly_search_volume: z.number().int().min(0).nullable(),
    confidence: z.enum(["low", "medium", "high"]),
    opportunity_type: z.enum(["hypothesis"]).optional(),
    generated_at: IsoDateTimeSchema.optional(),
  })
  .superRefine((record, ctx) => {
    if (record.measurement_status === "not_measured") {
      const measuredFields = [
        ["measurement_source", record.measurement_source],
        ["visibility_pct", record.visibility_pct],
        ["monthly_search_volume", record.monthly_search_volume],
      ] as const;
      for (const [field, value] of measuredFields) {
        if (value !== null) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `measurement_status "not_measured" requires ${field} to be null: standalone records carry no measurement values`,
          });
        }
      }
      if (record.measurement_provenance !== undefined) {
        ctx.addIssue({
          code: "custom",
          path: ["measurement_provenance"],
          message:
            'measurement_status "not_measured" must not carry measurement provenance — provenance belongs to published measurements only',
        });
      }
      return;
    }
    if (record.measurement_status === "imported") {
      return;
    }
    // simulated | measured — a published measurement always names where it
    // came from and carries its visibility; a number without provenance
    // fails here, never downstream (blueprint validation family 2).
    if (record.measurement_provenance === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["measurement_provenance"],
        message: `measurement_status "${record.measurement_status}" requires measurement_provenance (source, model_id, date range)`,
      });
    }
    if (record.measurement_source === null) {
      ctx.addIssue({
        code: "custom",
        path: ["measurement_source"],
        message: `measurement_status "${record.measurement_status}" requires a non-null measurement_source`,
      });
    }
    if (record.visibility_pct === null) {
      ctx.addIssue({
        code: "custom",
        path: ["visibility_pct"],
        message: `measurement_status "${record.measurement_status}" requires a non-null visibility_pct`,
      });
    }
  });

export type IntentRecordV2 = z.output<typeof IntentRecordV2Schema>;
export type MeasurementProvenance = z.output<typeof MeasurementProvenanceSchema>;
