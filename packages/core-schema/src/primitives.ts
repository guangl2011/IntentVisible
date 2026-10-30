import { z } from "zod";

import { SCHEMA_VERSION_PATTERN } from "./version.js";

/**
 * Primitive schemas and the pattern strings behind them. Patterns are kept
 * as exported strings because the hand-authored JSON Schema files embed the
 * same values; parity tests fail when the two drift apart.
 */

export const INTENT_ID_PATTERN = "^int_[a-z0-9_]{1,100}$";
export const BRAND_ID_PATTERN = "^brand_[a-z0-9_]{1,100}$";
export const PRODUCT_ID_PATTERN = "^product_[a-z0-9_]{1,100}$";
export const SKU_ID_PATTERN = "^sku_[a-z0-9_]{1,100}$";
export const MAPPING_ID_PATTERN = "^map_[a-z0-9_]{1,100}$";
export const DOMAIN_PATTERN = "^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$";
export const COUNTRY_PATTERN = "^[A-Z]{2}$";
export const LANGUAGE_PATTERN = "^[a-z]{2}$";
export const CURRENCY_PATTERN = "^[A-Z]{3}$";

/** Builds a string schema from one of the pattern constants above. */
export function patternSchema(pattern: string, message: string): z.ZodString {
  return z.string().regex(new RegExp(pattern), message);
}

export const SchemaVersionSchema = patternSchema(
  SCHEMA_VERSION_PATTERN,
  "schema_version must be SemVer compatible with major 1 (e.g. 1.0.0)",
);
export const IntentIdSchema = patternSchema(
  INTENT_ID_PATTERN,
  "intent_id must look like int_<slug> (lowercase letters, digits, underscores)",
);
export const BrandIdSchema = patternSchema(
  BRAND_ID_PATTERN,
  "brand_id must look like brand_<slug>",
);
export const ProductIdSchema = patternSchema(
  PRODUCT_ID_PATTERN,
  "product_id must look like product_<slug>",
);
export const SkuIdSchema = patternSchema(SKU_ID_PATTERN, "sku_id must look like sku_<slug>");
export const MappingIdSchema = patternSchema(
  MAPPING_ID_PATTERN,
  "mapping_id must look like map_<slug>",
);
export const DomainSchema = patternSchema(
  DOMAIN_PATTERN,
  "domain must be a lowercase registrable domain (e.g. example.com)",
);
export const CountryCodeSchema = patternSchema(
  COUNTRY_PATTERN,
  "country must be an ISO 3166-1 alpha-2 code",
);
export const LanguageCodeSchema = patternSchema(
  LANGUAGE_PATTERN,
  "language must be an ISO 639-1 code",
);
export const CurrencyCodeSchema = patternSchema(
  CURRENCY_PATTERN,
  "currency must be an ISO 4217 code",
);

/** RFC 3339 timestamp with Z or an explicit UTC offset. */
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });

// Evidence URLs are web pages; the WHATWG URL parser alone would also
// accept ftp:, mailto:, and other schemes, so pin the protocol explicitly
// to keep the Zod contract as strict as the intent of evidence_urls.
export const UrlSchema = z.url().refine(
  (raw) => {
    const protocol = new URL(raw).protocol;
    return protocol === "http:" || protocol === "https:";
  },
  { message: "URL must use the http or https scheme" },
);

/** Every record carries at least one evidence URL — the traceability floor. */
export const EvidenceUrlsSchema = z.array(UrlSchema).min(1).max(100);

/** Rule/semantic relevance in [0, 1] — never a purchase probability. */
export const MatchStrengthSchema = z.number().min(0).max(1);

/**
 * Reference to a stored page snapshot. content_hash is the
 * incremental-refresh key: an unchanged hash lets later packages skip
 * regeneration (spec Data contract; plan M3).
 */
export const SnapshotRefSchema = z.strictObject({
  url: UrlSchema,
  content_hash: z.string().min(1).max(128),
  fetched_at: IsoDateTimeSchema,
  storage_ref: z.string().min(1).max(512),
});
