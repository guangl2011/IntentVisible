import { z } from "zod";

import { GENERATION_METHODS } from "./enums.js";
import {
  BrandIdSchema,
  CurrencyCodeSchema,
  EvidenceUrlsSchema,
  IsoDateTimeSchema,
  ProductIdSchema,
  SchemaVersionSchema,
  SkuIdSchema,
  SnapshotRefSchema,
  UrlSchema,
} from "./primitives.js";

/** Displayed price with ISO 4217 currency. */
export const PriceSchema = z.strictObject({
  amount: z.number().min(0),
  currency: CurrencyCodeSchema,
});

export const SpecificationEntrySchema = z.strictObject({
  name: z.string().min(1).max(200),
  value: z.string().min(1).max(500),
});

export const FaqEntrySchema = z.strictObject({
  question: z.string().min(1).max(500),
  answer: z.string().min(1).max(2000),
});

export const SkuSummarySchema = z.strictObject({
  sku_id: SkuIdSchema,
  name: z.string().min(1).max(300).optional(),
  price: PriceSchema.optional(),
  url: UrlSchema.optional(),
});

/**
 * Evidence-cited product profile produced by URL extraction (plan M1:
 * JSON-LD / Schema.org Product parsing). May be empty of SKUs when the PDP
 * does not evidence a variant split; consumers then treat the product as
 * its own SKU (plan M3).
 */
export const ProductProfileSchema = z.strictObject({
  schema_version: SchemaVersionSchema,
  product_id: ProductIdSchema,
  brand_id: BrandIdSchema,
  name: z.string().min(1).max(300),
  url: UrlSchema,
  description: z.string().min(1).max(5000).optional(),
  price: PriceSchema.optional(),
  features: z.array(z.string().min(1).max(500)).max(200),
  specifications: z.array(SpecificationEntrySchema).max(500),
  use_cases: z.array(z.string().min(1).max(500)).max(100),
  compatibility: z.array(z.string().min(1).max(500)).max(100),
  faqs: z.array(FaqEntrySchema).max(100).optional(),
  skus: z.array(SkuSummarySchema).max(500),
  shipping_and_returns: z.array(z.string().min(1).max(500)).max(50).optional(),
  evidence_urls: EvidenceUrlsSchema,
  snapshot_refs: z.array(SnapshotRefSchema).min(1).max(200),
  generation_method: z.enum(GENERATION_METHODS),
  generation_model: z.string().min(1).max(200).optional(),
  generated_at: IsoDateTimeSchema.optional(),
});
