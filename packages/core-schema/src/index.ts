/**
 * Intent Schema v1 — the contract package.
 *
 * Consumers use the Zod schemas for runtime validation and the generated
 * contract types; non-TS consumers use the JSON Schema files under
 * schemas/ (exposed via the "./schemas/*" export). Schemas change only in
 * dedicated PRs (plan section 10, principle 3).
 */

export * from "./enums.js";
export * from "./version.js";
export * from "./primitives.js";
export * from "./intent-record.js";
export * from "./brand-profile.js";
export * from "./product-profile.js";
export * from "./sku-intent-mapping.js";

export type {
  BrandProfile,
  IntentRecord,
  ProductProfile,
  SkuIntentMapping,
} from "./generated/index.js";
