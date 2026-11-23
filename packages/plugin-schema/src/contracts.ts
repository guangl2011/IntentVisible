/**
 * Write-path contracts for the plugin Phase I tables. Rows are validated
 * through these Zod schemas before insert and after read (same pattern as
 * the API's Shopify tables). The superRefinements carry the design's red
 * lines — most importantly the measurement boundary: a not_measured
 * visibility snapshot cannot carry measured values, and the plugin model
 * has no search-volume field anywhere to fabricate.
 */

import { z } from "zod";

import { BUYER_STAGES, CONFIDENCE_LEVELS, INTENT_CATEGORIES } from "@intentvisible/core-schema";

import {
  AFFILIATE_CHANNELS,
  ATTRIBUTION_BASES,
  COMMISSION_ENTRY_TYPES,
  COMMISSION_RATE_MAX,
  COMMISSION_RATE_MIN,
  COMMISSION_STATUSES,
  INTENT_UNIT_STATUSES,
  MEASUREMENT_KINDS,
  MEASUREMENT_STATUSES,
  SOURCE_ENGINES,
} from "./enums.js";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "expected YYYY-MM-DD");
const isoDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, "expected ISO-8601 UTC");

export const ShopIdSchema = z.string().min(1).max(100);

/** Visibility measurement attached to an intent unit (scope ①). */
export const VisibilitySnapshotContract = z
  .strictObject({
    measurement_status: z.enum(MEASUREMENT_STATUSES),
    measurement_kind: z.enum(MEASUREMENT_KINDS).nullable(),
    /** Engines the measurement actually covers — null when not measured. */
    source_engines: z.array(z.enum(SOURCE_ENGINES)).min(1).nullable(),
    measurement_window_start: isoDate.nullable(),
    measurement_window_end: isoDate.nullable(),
    /** Visibility for the window, 0–100. Null when not measured. */
    visibility_pct: z.number().min(0).max(100).nullable(),
    measurement_source: z.string().min(1).max(200).nullable(),
  })
  .superRefine((v, ctx) => {
    if (v.measurement_status === "not_measured") {
      const measuredFields = [
        ["measurement_kind", v.measurement_kind],
        ["source_engines", v.source_engines],
        ["measurement_window_start", v.measurement_window_start],
        ["measurement_window_end", v.measurement_window_end],
        ["visibility_pct", v.visibility_pct],
        ["measurement_source", v.measurement_source],
      ] as const;
      for (const [field, value] of measuredFields) {
        if (value !== null) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `measurement_status "not_measured" requires ${field} to be null: unmeasured units carry no measured values (boundary invariant)`,
          });
        }
      }
      return;
    }

    const requiredFields = [
      ["measurement_kind", v.measurement_kind],
      ["source_engines", v.source_engines],
      ["measurement_window_start", v.measurement_window_start],
      ["measurement_window_end", v.measurement_window_end],
      ["visibility_pct", v.visibility_pct],
      ["measurement_source", v.measurement_source],
    ] as const;
    for (const [field, value] of requiredFields) {
      if (value === null || (Array.isArray(value) && value.length === 0)) {
        ctx.addIssue({
          code: "custom",
          path: [field],
          message: `measurement_status "${v.measurement_status}" requires ${field}: a measured snapshot always names its provenance`,
        });
      }
    }

    if (
      v.measurement_kind === "single_day" &&
      v.measurement_window_start !== null &&
      v.measurement_window_start !== v.measurement_window_end
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["measurement_window_end"],
        message: "single_day snapshots must have window_start === window_end",
      });
    }
    if (
      v.measurement_kind === "rolling" &&
      v.measurement_window_start !== null &&
      v.measurement_window_end !== null &&
      v.measurement_window_start >= v.measurement_window_end
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["measurement_window_end"],
        message: "rolling snapshots must have window_start < window_end",
      });
    }
  });

export type VisibilitySnapshot = z.infer<typeof VisibilitySnapshotContract>;

/** Commission ledger entry (scope ④): a billed commission or a refund offset. */
export const CommissionEntryContract = z
  .strictObject({
    entry_type: z.enum(COMMISSION_ENTRY_TYPES),
    status: z.enum(COMMISSION_STATUSES),
    /** Rate actually applied, within the locked 5–20% band. */
    rate: z.number().min(COMMISSION_RATE_MIN).max(COMMISSION_RATE_MAX),
    /** Net-sales billing base (design §1.7: net, not gross). */
    base_amount: z.number().min(0),
    /** Commission rows ≥ 0; refund offset rows are strictly negative. */
    amount: z.number(),
    /** For refund_offset rows: the commission entry being offset. */
    offsets_entry_id: z.number().int().positive().nullable(),
  })
  .superRefine((e, ctx) => {
    if (e.entry_type === "refund_offset") {
      if (e.amount >= 0) {
        ctx.addIssue({
          code: "custom",
          path: ["amount"],
          message: "refund_offset entries must carry a negative amount",
        });
      }
      if (e.offsets_entry_id === null) {
        ctx.addIssue({
          code: "custom",
          path: ["offsets_entry_id"],
          message: "refund_offset entries must reference the commission entry they offset",
        });
      }
      if (e.status !== "refunded") {
        ctx.addIssue({
          code: "custom",
          path: ["status"],
          message: "refund_offset entries must have status \"refunded\"",
        });
      }
      return;
    }
    if (e.amount < 0) {
      ctx.addIssue({
        code: "custom",
        path: ["amount"],
        message: "commission entries must carry a non-negative amount",
      });
    }
    if (e.status === "refunded") {
      ctx.addIssue({
        code: "custom",
        path: ["status"],
        message: "commission entries use pending/confirmed; a refund is recorded as a refund_offset row",
      });
    }
    if (e.offsets_entry_id !== null) {
      ctx.addIssue({
        code: "custom",
        path: ["offsets_entry_id"],
        message: "only refund_offset entries may reference another entry",
      });
    }
  });

export type CommissionEntry = z.infer<typeof CommissionEntryContract>;

/** An order row's attribution fields (scope ③): the basis must match the fields it claims. */
export const OrderAttributionContract = z
  .strictObject({
    attribution_basis: z.enum(ATTRIBUTION_BASES),
    utm_source: z.string().max(200).nullable(),
    utm_medium: z.string().max(200).nullable(),
    utm_campaign: z.string().max(200).nullable(),
    click_id: z.string().max(200).nullable(),
    discount_codes: z.array(z.string().min(1).max(100)).max(50),
    channel_group: z.string().min(1).max(100),
  })
  .superRefine((a, ctx) => {
    if (a.attribution_basis === "utm" && (a.utm_source === null || a.utm_medium === null)) {
      ctx.addIssue({
        code: "custom",
        path: ["utm_source"],
        message: 'attribution_basis "utm" requires utm_source and utm_medium',
      });
    }
    if (a.attribution_basis === "click_id" && a.click_id === null) {
      ctx.addIssue({
        code: "custom",
        path: ["click_id"],
        message: 'attribution_basis "click_id" requires a click id',
      });
    }
    if (a.attribution_basis === "discount_code" && a.discount_codes.length === 0) {
      ctx.addIssue({
        code: "custom",
        path: ["discount_codes"],
        message: 'attribution_basis "discount_code" requires at least one discount code',
      });
    }
    if (a.attribution_basis === "unattributed") {
      const leak = [
        ["utm_source", a.utm_source],
        ["utm_medium", a.utm_medium],
        ["utm_campaign", a.utm_campaign],
        ["click_id", a.click_id],
      ] as const;
      for (const [field, value] of leak) {
        if (value !== null) {
          ctx.addIssue({
            code: "custom",
            path: [field],
            message: `attribution_basis "unattributed" requires ${field} to be null`,
          });
        }
      }
      if (a.discount_codes.length > 0) {
        ctx.addIssue({
          code: "custom",
          path: ["discount_codes"],
          message: 'a discounted order is attributable via "discount_code", not "unattributed"',
        });
      }
    }
  });

export type OrderAttribution = z.infer<typeof OrderAttributionContract>;

/** Shared fragments for the remaining write-path contracts. */
export const IntentUnitContract = z.strictObject({
  intent_name: z.string().min(1).max(200),
  buyer_stage: z.enum(BUYER_STAGES),
  intent_category: z.enum(INTENT_CATEGORIES),
  persona: z.string().min(1).max(200),
  pain_point: z.string().min(1).max(500),
  status: z.enum(INTENT_UNIT_STATUSES),
  confidence: z.enum(CONFIDENCE_LEVELS),
  evidence_urls: z.array(z.string().url()).min(1).max(20),
});
export type IntentUnit = z.infer<typeof IntentUnitContract>;

export const IntentPromptContract = z.strictObject({
  prompt_text: z.string().min(1).max(1000),
  is_primary: z.boolean(),
});
export type IntentPrompt = z.infer<typeof IntentPromptContract>;

export const AiReferralSessionContract = z.strictObject({
  session_id: z.string().min(1).max(100),
  source: z.enum(SOURCE_ENGINES),
  referrer_url: z.string().url(),
  landed_url: z.string().url(),
  utm_source: z.string().max(200).nullable(),
  utm_medium: z.string().max(200).nullable(),
  utm_campaign: z.string().max(200).nullable(),
  occurred_at: isoDateTime,
});
export type AiReferralSession = z.infer<typeof AiReferralSessionContract>;

export const AffiliateVisitContract = z.strictObject({
  visit_id: z.string().min(1).max(100),
  channel: z.enum(AFFILIATE_CHANNELS),
  partner: z.string().min(1).max(200),
  tracking_code: z.string().min(1).max(100),
  landed_intent_id: z.string().min(1).max(100).nullable(),
  landed_at: isoDateTime,
});
export type AffiliateVisit = z.infer<typeof AffiliateVisitContract>;
