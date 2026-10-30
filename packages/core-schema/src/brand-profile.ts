import { z } from "zod";

import { GENERATION_METHODS } from "./enums.js";
import {
  BrandIdSchema,
  DomainSchema,
  EvidenceUrlsSchema,
  IsoDateTimeSchema,
  SchemaVersionSchema,
  SnapshotRefSchema,
} from "./primitives.js";

/**
 * Evidence-cited brand profile produced by URL extraction (plan M1).
 * Competitors and trust signals are listed only where the site itself
 * evidences them.
 */
export const BrandProfileSchema = z.strictObject({
  schema_version: SchemaVersionSchema,
  brand_id: BrandIdSchema,
  name: z.string().min(1).max(300),
  domain: DomainSchema,
  description: z.string().min(1).max(2000).optional(),
  categories: z.array(z.string().min(1).max(200)).max(50),
  competitor_brands: z.array(z.string().min(1).max(200)).max(50),
  differentiators: z.array(z.string().min(1).max(500)).max(100),
  use_cases: z.array(z.string().min(1).max(500)).max(100),
  personas: z.array(z.string().min(1).max(200)).max(100),
  pain_points: z.array(z.string().min(1).max(500)).max(100),
  purchase_barriers: z.array(z.string().min(1).max(500)).max(100),
  trust_evidence: z.array(z.string().min(1).max(500)).max(100),
  evidence_urls: EvidenceUrlsSchema,
  snapshot_refs: z.array(SnapshotRefSchema).min(1).max(200),
  generation_method: z.enum(GENERATION_METHODS),
  generation_model: z.string().min(1).max(200).optional(),
  generated_at: IsoDateTimeSchema.optional(),
});
