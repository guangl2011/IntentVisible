import { z } from "zod";

import { ELIGIBILITY_STATUSES } from "./enums.js";
import {
  EvidenceUrlsSchema,
  IntentIdSchema,
  MappingIdSchema,
  MatchStrengthSchema,
  ProductIdSchema,
  SchemaVersionSchema,
  SkuIdSchema,
  UrlSchema,
} from "./primitives.js";

/**
 * Intent-to-SKU linkage record (plan M3). match_strength is rule/semantic
 * relevance — never a purchase probability; eligibility stays "unverified"
 * in standalone mode until a later integration package confirms it.
 */
export const SkuIntentMappingSchema = z.strictObject({
  schema_version: SchemaVersionSchema,
  mapping_id: MappingIdSchema,
  intent_id: IntentIdSchema,
  sku_id: SkuIdSchema,
  product_id: ProductIdSchema.optional(),
  match_strength: MatchStrengthSchema,
  eligibility: z.enum(ELIGIBILITY_STATUSES),
  landing_url: UrlSchema,
  evidence_urls: EvidenceUrlsSchema,
});
