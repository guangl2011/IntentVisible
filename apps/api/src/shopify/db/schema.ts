/**
 * Shopify merchant tables (spec art_Aj4HcWgx, D2) — SQLite dialect.
 *
 * Postgres-in-production / SQLite-in-tests is the approved stack; this
 * slice realizes the SQLite dialect (tests, local dev) and keeps every
 * access behind the dialect-agnostic ShopifyStore interface, so a Postgres
 * realization of the same tables slots in without touching routes or job
 * runners. The gap is called out in the PR.
 *
 * Merchant isolation is structural: every table carries store_id and every
 * query in store.ts is bound to one store's handle — no call site passes
 * filters to opt into scoping. Contract payloads (BrandProfile,
 * ProductProfile, IntentRecord, SkuIntentMapping) are persisted as validated
 * JSON and re-parsed through their core-schema schemas on write and read.
 */

import {
  index,
  integer,
  real,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

/**
 * One connected store. The myshopify domain is the store's stable identity
 * (shared with OAuth, Admin API, and webhook headers); `id` is the
 * IntentVisible store id the routes address (/v1/stores/:id). The Admin
 * access token is stored only in encrypted form (secrets.ts) — the
 * plaintext never touches disk.
 */
export const merchants = sqliteTable("merchants", {
  id: text("id").primaryKey(),
  shopDomain: text("shop_domain").notNull().unique(),
  /** AES-256-GCM envelope from encryptToken — null until the OAuth callback lands. */
  encryptedAccessToken: text("encrypted_access_token"),
  /** Scopes the store actually granted (JSON array). */
  grantedScopes: text("granted_scopes"),
  connected: integer("connected", { mode: "boolean" }).notNull().default(false),
  /** Validated BrandProfile JSON from the latest catalog sync. */
  brandProfile: text("brand_profile"),
  createdAt: text("created_at").notNull(),
  updatedAt: text("updated_at").notNull(),
});

/** Single-use OAuth state nonces — consumed by the first verified callback. */
export const oauthStates = sqliteTable("oauth_states", {
  shopDomain: text("shop_domain").primaryKey(),
  state: text("state").notNull(),
  createdAt: text("created_at").notNull(),
});

/**
 * Raw Admin GraphQL response pages, content-hashed (the incremental-sync
 * key). synced_at is touched on every sync that re-encounters the hash, so
 * the latest sync's page set is exactly synced_at = max(synced_at) — the
 * evidence base the generation job cites.
 */
export const catalogSnapshots = sqliteTable(
  "catalog_snapshots",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id").notNull(),
    contentHash: text("content_hash").notNull(),
    storageRef: text("storage_ref").notNull(),
    url: text("url").notNull(),
    fetchedAt: text("fetched_at").notNull(),
    syncedAt: text("synced_at").notNull(),
    /** The verbatim response body. */
    raw: text("raw").notNull(),
  },
  (table) => [
    uniqueIndex("catalog_snapshots_store_hash_uq").on(table.storeId, table.contentHash),
    index("catalog_snapshots_store_idx").on(table.storeId),
  ],
);

/**
 * Synced products. The validated ProductProfile is the payload; the
 * denormalized columns serve the dashboard's catalog list. products/delete
 * sets deleted_at (soft) — rows are never removed.
 */
export const products = sqliteTable(
  "products",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id").notNull(),
    productId: text("product_id").notNull(),
    name: text("name").notNull(),
    pdpUrl: text("pdp_url").notNull(),
    /** Validated ProductProfile JSON. */
    payload: text("payload").notNull(),
    deletedAt: text("deleted_at"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("products_store_product_uq").on(table.storeId, table.productId),
    index("products_store_idx").on(table.storeId),
  ],
);

/** Synced variant/SKU rows — the catalog side of the mapping read. */
export const skus = sqliteTable(
  "skus",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id").notNull(),
    productId: text("product_id").notNull(),
    skuId: text("sku_id").notNull(),
    name: text("name"),
    priceAmount: real("price_amount"),
    priceCurrency: text("price_currency"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [
    uniqueIndex("skus_store_sku_uq").on(table.storeId, table.skuId),
    index("skus_store_product_idx").on(table.storeId, table.productId),
  ],
);

/**
 * Validated IntentRecord rows, versioned: re-runs append a row per new
 * intent_version (dedupe-stable intent_id); the read view takes the max
 * version per intent_id. No row is ever deleted — versions are the audit
 * trail.
 */
export const intents = sqliteTable(
  "intents",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id").notNull(),
    intentId: text("intent_id").notNull(),
    intentVersion: integer("intent_version").notNull(),
    /** Validated IntentRecord JSON. */
    payload: text("payload").notNull(),
    scope: text("scope").notNull(),
    brandId: text("brand_id").notNull(),
    intentCategory: text("intent_category").notNull(),
    buyerStage: text("buyer_stage").notNull(),
    country: text("country").notNull(),
    language: text("language").notNull(),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("intents_store_id_version_uq").on(
      table.storeId,
      table.intentId,
      table.intentVersion,
    ),
    index("intents_store_idx").on(table.storeId),
  ],
);

/**
 * SKU ↔ intent links. `active` is the soft-invalidation flag the
 * products/delete webhook flips (with invalidated_at) — mappings are never
 * hard-deleted.
 */
export const skuIntentMappings = sqliteTable(
  "sku_intent_mappings",
  {
    id: integer("id").primaryKey({ autoIncrement: true }),
    storeId: text("store_id").notNull(),
    mappingId: text("mapping_id").notNull(),
    intentId: text("intent_id").notNull(),
    skuId: text("sku_id").notNull(),
    productId: text("product_id"),
    /** Validated SkuIntentMapping JSON. */
    payload: text("payload").notNull(),
    active: integer("active", { mode: "boolean" }).notNull().default(true),
    invalidatedAt: text("invalidated_at"),
    createdAt: text("created_at").notNull(),
  },
  (table) => [
    uniqueIndex("sku_intent_mappings_store_mapping_uq").on(table.storeId, table.mappingId),
    index("sku_intent_mappings_store_product_idx").on(table.storeId, table.productId),
  ],
);

/**
 * Shopify jobs (catalog sync, intent generation) — the D2 state machine:
 * queued → syncing|generating → validating → complete | failed, with the
 * typed failure vocabulary in jobs.ts.
 */
export const shopifyJobs = sqliteTable(
  "shopify_jobs",
  {
    id: text("id").primaryKey(),
    storeId: text("store_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull(),
    /** JSON array of { status, at }. */
    statusHistory: text("status_history").notNull(),
    /** JSON { reason, detail } on a failed job — null otherwise. */
    error: text("error"),
    /** JSON result summary on a complete job — null otherwise. */
    result: text("result"),
    createdAt: text("created_at").notNull(),
    updatedAt: text("updated_at").notNull(),
  },
  (table) => [index("shopify_jobs_store_idx").on(table.storeId)],
);

/** Delivery ids already processed — webhook replay protection. */
export const webhookDeliveries = sqliteTable("webhook_deliveries", {
  webhookId: text("webhook_id").primaryKey(),
  topic: text("topic").notNull(),
  shopDomain: text("shop_domain"),
  processedAt: text("processed_at").notNull(),

});
