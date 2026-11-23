/**
 * Shared vocabularies for the plugin Phase I tables (design v1.4 §1.5).
 * Every enum is the single source for both the Zod contracts and the
 * Drizzle column types — a value that is not listed here cannot enter a
 * validated row.
 */

/**
 * Measurement status of a visibility snapshot. Reuses the core-schema
 * vocabulary: `not_measured` rows carry no measured values — the boundary
 * invariant (no fabricated search volume or visibility).
 */
export const MEASUREMENT_STATUSES = ["not_measured", "imported", "measured"] as const;

/** How a measurement window spans time. Single-day snapshots are labeled so the UI can down-rank them (audit guidance: prefer rolling windows). */
export const MEASUREMENT_KINDS = ["rolling", "single_day"] as const;

/**
 * AI engines in the Phase I monitoring set (test plan: chatgpt.com,
 * gemini, perplexity). Used both for visibility `source_engines` and for
 * AI-referral session source marks.
 */
export const SOURCE_ENGINES = ["chatgpt.com", "gemini", "perplexity"] as const;

/** Review lifecycle of an intent unit in the plugin (design §2.3: draft / pending / active). */
export const INTENT_UNIT_STATUSES = ["draft", "pending_review", "active"] as const;

/** Attribution basis of an order (Phase I: URL parameters + discount-code hard anchor). */
export const ATTRIBUTION_BASES = ["utm", "click_id", "discount_code", "unattributed"] as const;

/** Commission ledger entry kinds: a billed commission or a refund offset row. */
export const COMMISSION_ENTRY_TYPES = ["commission", "refund_offset"] as const;

/** Commission status machine (design §2.5: pending → confirmed → refunded). */
export const COMMISSION_STATUSES = ["pending", "confirmed", "refunded"] as const;

/** Intent Match affiliate channels (design §2.5: Play / Ads). */
export const AFFILIATE_CHANNELS = ["play", "ads"] as const;

/** Commission rate bounds locked in design v1.3 (§1.7): 5–20%. */
export const COMMISSION_RATE_MIN = 0.05;
export const COMMISSION_RATE_MAX = 0.2;

export type MeasurementStatus = (typeof MEASUREMENT_STATUSES)[number];
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];
export type SourceEngine = (typeof SOURCE_ENGINES)[number];
export type IntentUnitStatus = (typeof INTENT_UNIT_STATUSES)[number];
export type AttributionBasis = (typeof ATTRIBUTION_BASES)[number];
export type CommissionEntryType = (typeof COMMISSION_ENTRY_TYPES)[number];
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];
export type AffiliateChannel = (typeof AFFILIATE_CHANNELS)[number];
