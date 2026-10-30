import { z } from "zod";

import {
  BrandIdSchema,
  EvidenceUrlsSchema,
  FaqEntrySchema,
  GENERATION_METHODS,
  IsoDateTimeSchema,
  PriceSchema,
  ProductIdSchema,
  SchemaVersionSchema,
  SnapshotRefSchema,
  SpecificationEntrySchema,
  UrlSchema,
} from "@intentvisible/core-schema";

/**
 * Package-local landing-page profile.
 *
 * core-schema is frozen (schemas change only in dedicated PRs), and this is
 * the one profile the extractor produces that the contract does not yet
 * cover — so it lives here, Zod-validated, with per-field evidence. If the
 * diagnosis Skill package later needs it in the shared contract, it is
 * promoted through a dedicated core-schema PR.
 */

/** A value the pipeline extracted, with the page it was extracted from. */
export interface Evidenced<T> {
  value: T;
  evidence_url: string;
}

/** Wraps an inner schema so no value can exist without its source URL. */
export function evidenced<T extends z.ZodType>(value: T) {
  return z.strictObject({ value, evidence_url: UrlSchema });
}

export const LandingPageProfileSchema = z.strictObject({
  schema_version: SchemaVersionSchema,
  url: UrlSchema,
  brand_id: BrandIdSchema.optional(),
  product_id: ProductIdSchema.optional(),
  title: evidenced(z.string().min(1).max(300)).nullable(),
  description: evidenced(z.string().min(1).max(5000)).nullable(),
  price: evidenced(PriceSchema).nullable(),
  specifications: z.array(evidenced(SpecificationEntrySchema)).max(500),
  faqs: z.array(evidenced(FaqEntrySchema)).max(100),
  ctas: z.array(evidenced(z.string().min(1).max(200))).max(50),
  features: z.array(evidenced(z.string().min(1).max(500))).max(200),
  use_cases: z.array(evidenced(z.string().min(1).max(500))).max(100),
  compatibility: z.array(evidenced(z.string().min(1).max(500))).max(100),
  shipping_and_returns: z.array(evidenced(z.string().min(1).max(500))).max(50),
  evidence_urls: EvidenceUrlsSchema,
  snapshot_refs: z.array(SnapshotRefSchema).min(1).max(200),
  generation_method: z.enum(GENERATION_METHODS),
  generated_at: IsoDateTimeSchema,
});

export type LandingPageProfile = z.output<typeof LandingPageProfileSchema>;

export type EvidencedString = Evidenced<string>;
export type EvidencedPrice = Evidenced<z.output<typeof PriceSchema>>;
export type EvidencedSpecification = Evidenced<z.output<typeof SpecificationEntrySchema>>;
export type EvidencedFaq = Evidenced<z.output<typeof FaqEntrySchema>>;
