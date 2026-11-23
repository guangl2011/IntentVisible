/**
 * Plugin Phase I tables (design v1.4 §1.5) — SQLite dialect.
 *
 * Postgres-in-production / SQLite-in-tests is the approved stack; this
 * package realizes the SQLite dialect (tests, local dev) exactly like the
 * API's Shopify tables, so a Postgres realization slots in later without
 * touching consumers. The gap is noted in the PR.
 *
 * Tenant isolation is structural: every table carries `shop_id` and the
 * plugin reads are always bound to one shop — no call site passes filters
 * to opt into scoping. Payloads with shape rules (visibility, order
 * attribution, commission entries) are persisted as JSON and re-validated
 * through the contracts on write and read.
 */

import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/** One connected shop — the plugin's tenant row. */
export const shops = sqliteTable("shops", {
  /** Tenant id used by every other table's shop_id. */
  id: text("id").primaryKey(),
  shopDomain: text("shop_domain").notNull().unique(),
  /** Demo seed flag — demo rows never mix with live merchant data. */
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  installedAt: text("installed_at").notNull(),
});

/**
 * Buyer-intent units (scope ①). S2000-shaped: one row per intent unit,
 * versioned; prompts hang off the unit.
 */
export const intentUnits = sqliteTable(
  "intent_units",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: text("shop_id").notNull(),
    intentId: text("intent_id").notNull(),
    intentVersion: integer("intent_version").notNull(),
    intentName: text("intent_name").notNull(),
    scope: text("scope").notNull(),
    buyerStage: text("buyer_stage").notNull(),
    intentCategory: text("intent_category").notNull(),
    persona: text("persona").notNull(),
    painPoint: text("pain_point").notNull(),
    status: text("status").notNull(),
    confidence: text("confidence").notNull(),
    /** Evidence chain — JSON array of URLs, min 1 (intent red line). */
    evidenceUrls: text("evidence_urls", { mode: "json" })
      .$type<string[]>()
      .notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("intent_units_shop_id_version_uq").on(
      table.shopId,
      table.intentId,
      table.intentVersion,
    ),
    index("intent_units_shop_idx").on(table.shopId),
  ],
);

/** Buyer prompts grouped under an intent unit (scope ①). */
export const intentPrompts = sqliteTable(
  "intent_prompts",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: text("shop_id").notNull(),
    intentId: text("intent_id").notNull(),
    promptText: text("prompt_text").notNull(),
    isPrimary: integer("is_primary", { mode: "boolean" }).notNull().default(false),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("intent_prompts_shop_intent_text_uq").on(
      table.shopId,
      table.intentId,
      table.promptText,
    ),
    index("intent_prompts_shop_intent_idx").on(table.shopId, table.intentId),
  ],
);

/**
 * Visibility measurements (scope ①). One row per intent unit; the payload
 * is the validated VisibilitySnapshot JSON (measurement boundary invariant
 * lives in the contract). `source_engines` and the measurement window are
 * part of the payload — the UI reads them as provenance labels.
 */
export const visibilitySnapshots = sqliteTable(
  "visibility_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: text("shop_id").notNull(),
    intentId: text("intent_id").notNull(),
    /** Validated VisibilitySnapshot JSON. */
    payload: text("payload").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("visibility_snapshots_shop_intent_uq").on(table.shopId, table.intentId),
    index("visibility_snapshots_shop_idx").on(table.shopId),
  ],
);

/**
 * AI-referral sessions (scope ②): visits whose referrer is an AI engine
 * (chatgpt.com / gemini / perplexity). These are the T side (traffic) of
 * the D→T→O attribution model (§1.8).
 */
export const aiReferralSessions = sqliteTable(
  "ai_referral_sessions",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: text("shop_id").notNull(),
    sessionId: text("session_id").notNull(),
    /** AI engine source mark (SOURCE_ENGINES). */
    source: text("source").notNull(),
    referrerUrl: text("referrer_url").notNull(),
    landedUrl: text("landed_url").notNull(),
    /** Intent unit the visit landed on, when resolved. */
    landedIntentId: text("landed_intent_id"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    occurredAt: text("occurred_at").notNull(),
  },
  (table) => [
    uniqueIndex("ai_referral_sessions_shop_session_uq").on(table.shopId, table.sessionId),
    index("ai_referral_sessions_shop_source_idx").on(table.shopId, table.source),
  ],
);

/**
 * Real order ledger (scope ③) — the Source of Truth anchor. Attribution
 * fields are the validated OrderAttribution JSON; net_sales excludes
 * discounts and refunds (ROAS guard).
 */
export const orders = sqliteTable(
  "orders",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: text("shop_id").notNull(),
    orderId: text("order_id").notNull(),
    orderNumber: text("order_number").notNull(),
    netSales: real("net_sales").notNull(),
    currency: text("currency").notNull(),
    /** Validated OrderAttribution JSON (utm / click_id / discount_codes…). */
    attribution: text("attribution").notNull(),
    isFirstOrder: integer("is_first_order", { mode: "boolean" }).notNull().default(false),
    /** Set when a refund lands — drives the commission offset. */
    refundedAt: text("refunded_at"),
    orderedAt: text("ordered_at").notNull(),
  },
  (table) => [
    uniqueIndex("orders_shop_order_uq").on(table.shopId, table.orderId),
    index("orders_shop_idx").on(table.shopId),
  ],
);

/**
 * Commission ledger (scope ④): per-order commission rows plus refund
 * offset rows (negative amounts) — never destructive edits. Payload is
 * the validated CommissionEntry JSON; `intent_id` / `channel` /
 * `tracking_code` carry the attribution the Commission page displays.
 */
export const commissionEntries = sqliteTable(
  "commission_entries",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: text("shop_id").notNull(),
    orderId: text("order_id").notNull(),
    intentId: text("intent_id"),
    channel: text("channel").notNull(),
    trackingCode: text("tracking_code"),
    /** Validated CommissionEntry JSON. */
    payload: text("payload").notNull(),
    billedPeriodStart: text("billed_period_start").notNull(),
    billedPeriodEnd: text("billed_period_end").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    index("commission_entries_shop_order_idx").on(table.shopId, table.orderId),
    index("commission_entries_shop_idx").on(table.shopId),
  ],
);

/**
 * Intent Match affiliate visits (scope ④): external traffic the match
 * engine brought, linked to orders through the shared tracking-code
 * system (§2.5 Affiliate Visit → Commission).
 */
export const affiliateVisits = sqliteTable(
  "affiliate_visits",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    shopId: text("shop_id").notNull(),
    visitId: text("visit_id").notNull(),
    /** Play / Ads channel (design §2.5). */
    channel: text("channel").notNull(),
    partner: text("partner").notNull(),
    trackingCode: text("tracking_code").notNull(),
    landedIntentId: text("landed_intent_id"),
    /** Order the visit converted into, when known. */
    orderId: text("order_id"),
    landedAt: text("landed_at").notNull(),
  },
  (table) => [
    uniqueIndex("affiliate_visits_shop_visit_uq").on(table.shopId, table.visitId),
    index("affiliate_visits_shop_tracking_idx").on(table.shopId, table.trackingCode),
  ],
);
