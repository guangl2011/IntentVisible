/**
 * Merchant-scoped persistence over the Drizzle db (spec D2).
 *
 * Isolation is structural, in two layers:
 *
 *  1. Every method on the root store is identity-scoped (merchants by id,
 *     OAuth state and webhook dedup by domain/id) — there is no unscoped
 *     catalog/intent accessor to call by mistake.
 *  2. Catalog and intent data is reachable ONLY through `forMerchant(id)`,
 *     a bound handle whose every query composes `store_id = <id>` inside
 *     the data layer. Call sites cannot forget the scope — they have no
 *     parameter to pass.
 *
 * Contract payloads (BrandProfile, ProductProfile, IntentRecord,
 * SkuIntentMapping) are parsed through their core-schema Zod schemas on
 * every write AND read — validated at the boundary, never stored or served
 * unvalidated.
 */

import { and, desc, eq, isNull, sql } from "drizzle-orm";

import {
  BrandProfileSchema,
  IntentRecordSchema,
  ProductProfileSchema,
  SkuIntentMappingSchema,
  type BrandProfile,
  type BuyerStage,
  type IntentCategory,
  type IntentRecord,
  type ProductProfile,
  type Scope,
  type SkuIntentMapping,
} from "@intentvisible/core-schema";
import {
  summaryOf,
  type ExistingIntentSummary,
  type SnapshotRef,
} from "@intentvisible/intent-engine";

import {
  catalogSnapshots,
  intents,
  merchants,
  oauthStates,
  products,
  shopifyJobs,
  skuIntentMappings,
  skus,
  webhookDeliveries,
} from "./db/schema.js";
import type { ShopifyDb } from "./db/client.js";
import type {
  ShopifyJobKind,
  ShopifyJobRecord,
  ShopifyJobResult,
  ShopifyJobStatus,
} from "./jobs.js";

/** Merchant row as the API sees it — token stays encrypted. */
export interface MerchantRecord {
  id: string;
  shop_domain: string;
  connected: boolean;
  encrypted_access_token: string | null;
  granted_scopes: string[];
  brand_profile: BrandProfile | null;
  created_at: string;
  updated_at: string;
}

export interface ProductRow {
  product_id: string;
  name: string;
  pdp_url: string;
  payload: ProductProfile;
  deleted_at: string | null;
}

export interface IntentRow {
  intent_id: string;
  intent_version: number;
  record: IntentRecord;
}

export interface MappingRow {
  mapping_id: string;
  intent_id: string;
  sku_id: string;
  product_id: string | null;
  payload: SkuIntentMapping;
  active: boolean;
  invalidated_at: string | null;
}

/** Read filters for the intent library view (D4 dashboard filtering). */
export interface IntentLibraryFilters {
  scope?: Scope;
  buyer_stage?: BuyerStage;
  intent_category?: IntentCategory;
  country?: string;
  language?: string;
}

export interface CatalogPageWrite {
  contentHash: string;
  storageRef: string;
  url: string;
  fetchedAt: string;
  raw: string;
}

export type CatalogPageOutcome = "stored" | "touched";

/**
 * Root store: merchant identity, OAuth state, webhook dedup, and job
 * records. Everything else — the merchant's catalog, library, mappings —
 * lives behind forMerchant().
 */
export interface ShopifyStore {
  upsertMerchant(merchant: MerchantRecord): Promise<void>;
  getMerchant(merchantId: string): Promise<MerchantRecord | null>;
  getMerchantByShopDomain(shopDomain: string): Promise<MerchantRecord | null>;
  saveOAuthState(shopDomain: string, state: string): Promise<void>;
  /** The pending nonce for a shop, if an install began (and was not consumed). */
  getOAuthState(shopDomain: string): Promise<string | undefined>;
  /** Single-use consumption — the verified callback removes the nonce. */
  consumeOAuthState(shopDomain: string): Promise<void>;
  getJob(jobId: string): Promise<ShopifyJobRecord | null>;
  /** Upserts a job record — the state machine's write path. */
  saveJob(job: ShopifyJobRecord): Promise<void>;
  /** The merchant's most recent job of one kind (overview's last-sync view). */
  latestJobByKind(merchantId: string, kind: ShopifyJobKind): Promise<ShopifyJobRecord | null>;
  /** Records a delivery id; false means a replay was already processed. */
  recordWebhookDelivery(delivery: {
    webhookId: string;
    topic: string;
    shopDomain: string | undefined;
    processedAt: string;
  }): Promise<boolean>;
  /** The bound handle for one merchant's data (structural scoping). */
  forMerchant(merchantId: string): MerchantScopedStore;
}

/**
 * Every accessor for ONE merchant's data. The merchantId is closed over at
 * construction — no method accepts a store id, so no call site can query
 * across merchants.
 */
export interface MerchantScopedStore {
  readonly merchantId: string;
  // ── Catalog sync writes ──
  saveCatalogPage(page: CatalogPageWrite, syncedAt: string): Promise<CatalogPageOutcome>;
  saveBrandProfile(profile: BrandProfile): Promise<void>;
  upsertProduct(profile: ProductProfile, syncedAt: string): Promise<void>;
  // ── Generation inputs ──
  /** Snapshot refs of the LATEST sync batch — the citable evidence base. */
  latestSnapshotRefs(): Promise<SnapshotRef[]>;
  getBrandProfile(): Promise<BrandProfile | null>;
  listProducts(): Promise<ProductRow[]>;
  // ── Intent library ──
  intentSummaries(): Promise<ExistingIntentSummary[]>;
  saveIntents(records: readonly IntentRecord[]): Promise<void>;
  listIntents(filters?: IntentLibraryFilters): Promise<IntentRow[]>;
  saveMappings(mappings: readonly SkuIntentMapping[]): Promise<void>;
  listMappings(): Promise<MappingRow[]>;
  // ── Webhook edge behavior ──
  markProductDeleted(productId: string, at: string): Promise<boolean>;
  /** Soft-invalidates a product's mappings; returns the distinct intent ids touched. */
  invalidateProductMappings(productId: string, at: string): Promise<string[]>;
  /** Version-bumps every intent citing the given SKUs so it loses the reference. */
  removeSkuReferences(skuIds: readonly string[]): Promise<string[]>;
}

/**
 * `store_<slug>` from the {slug}.myshopify.com domain — the stable
 * merchant id shared by install, jobs, and webhooks. The myshopify slug
 * charset is [a-z0-9-], so replacing hyphens with underscores is
 * injective: two domains never derive the same id.
 */
export function merchantIdFromShopDomain(shopDomain: string): string {
  const slug = shopDomain.split(".")[0] ?? "";
  return `store_${slug.replace(/-/g, "_")}`;
}

export class DrizzleShopifyStore implements ShopifyStore {
  constructor(private readonly db: ShopifyDb) {}

  async upsertMerchant(merchant: MerchantRecord): Promise<void> {
    const values = {
      id: merchant.id,
      shopDomain: merchant.shop_domain,
      encryptedAccessToken: merchant.encrypted_access_token,
      grantedScopes:
        merchant.granted_scopes.length > 0 ? JSON.stringify(merchant.granted_scopes) : null,
      connected: merchant.connected,
      brandProfile:
        merchant.brand_profile !== null
          ? JSON.stringify(BrandProfileSchema.parse(merchant.brand_profile))
          : null,
      createdAt: merchant.created_at,
      updatedAt: merchant.updated_at,
    };
    await this.db
      .insert(merchants)
      .values(values)
      .onConflictDoUpdate({
        target: merchants.id,
        // brand_profile is NOT in the set: it is owned by saveBrandProfile,
        // so a re-install or disconnect must never wipe it.
        set: {
          shopDomain: values.shopDomain,
          encryptedAccessToken: values.encryptedAccessToken,
          grantedScopes: values.grantedScopes,
          connected: values.connected,
          updatedAt: values.updatedAt,
        },
      });
  }

  async getMerchant(merchantId: string): Promise<MerchantRecord | null> {
    const row = await this.db.select().from(merchants).where(eq(merchants.id, merchantId)).get();
    return row ? merchantFromRow(row) : null;
  }

  async getMerchantByShopDomain(shopDomain: string): Promise<MerchantRecord | null> {
    const row = await this.db
      .select()
      .from(merchants)
      .where(eq(merchants.shopDomain, shopDomain))
      .get();
    return row ? merchantFromRow(row) : null;
  }

  async saveOAuthState(shopDomain: string, state: string): Promise<void> {
    const now = new Date().toISOString();
    await this.db
      .insert(oauthStates)
      .values({ shopDomain, state, createdAt: now })
      .onConflictDoUpdate({
        target: oauthStates.shopDomain,
        set: { state, createdAt: now },
      });
  }

  async getOAuthState(shopDomain: string): Promise<string | undefined> {
    const row = await this.db
      .select({ state: oauthStates.state })
      .from(oauthStates)
      .where(eq(oauthStates.shopDomain, shopDomain))
      .get();
    return row?.state;
  }

  async consumeOAuthState(shopDomain: string): Promise<void> {
    await this.db.delete(oauthStates).where(eq(oauthStates.shopDomain, shopDomain));
  }

  async getJob(jobId: string): Promise<ShopifyJobRecord | null> {
    const row = await this.db.select().from(shopifyJobs).where(eq(shopifyJobs.id, jobId)).get();
    return row ? jobFromRow(row) : null;
  }

  async saveJob(job: ShopifyJobRecord): Promise<void> {
    const row = jobToRow(job);
    await this.db
      .insert(shopifyJobs)
      .values(row)
      .onConflictDoUpdate({
        target: shopifyJobs.id,
        set: {
          status: row.status,
          statusHistory: row.statusHistory,
          error: row.error,
          result: row.result,
          updatedAt: row.updatedAt,
        },
      });
  }

  async latestJobByKind(merchantId: string, kind: ShopifyJobKind): Promise<ShopifyJobRecord | null> {
    const rows = await this.db
      .select()
      .from(shopifyJobs)
      .where(and(eq(shopifyJobs.storeId, merchantId), eq(shopifyJobs.kind, kind)))
      .orderBy(desc(shopifyJobs.updatedAt))
      .limit(1);
    return rows[0] !== undefined ? jobFromRow(rows[0]) : null;
  }

  async recordWebhookDelivery(delivery: {
    webhookId: string;
    topic: string;
    shopDomain: string | undefined;
    processedAt: string;
  }): Promise<boolean> {
    const inserted = await this.db
      .insert(webhookDeliveries)
      .values({
        webhookId: delivery.webhookId,
        topic: delivery.topic,
        shopDomain: delivery.shopDomain ?? null,
        processedAt: delivery.processedAt,
      })
      .onConflictDoNothing({ target: webhookDeliveries.webhookId })
      .returning({ webhookId: webhookDeliveries.webhookId });
    return inserted.length > 0;
  }

  forMerchant(merchantId: string): MerchantScopedStore {
    return new DrizzleMerchantScopedStore(this.db, merchantId);
  }
}

class DrizzleMerchantScopedStore implements MerchantScopedStore {
  constructor(
    private readonly db: ShopifyDb,
    readonly merchantId: string,
  ) {}

  async saveCatalogPage(page: CatalogPageWrite, syncedAt: string): Promise<CatalogPageOutcome> {
    const inserted = await this.db
      .insert(catalogSnapshots)
      .values({
        storeId: this.merchantId,
        contentHash: page.contentHash,
        storageRef: page.storageRef,
        url: page.url,
        fetchedAt: page.fetchedAt,
        syncedAt,
        raw: page.raw,
      })
      .onConflictDoUpdate({
        // Incremental re-sync: an unchanged content hash touches the page's
        // sync batch instead of storing a duplicate.
        target: [catalogSnapshots.storeId, catalogSnapshots.contentHash],
        set: { fetchedAt: page.fetchedAt, syncedAt },
      })
      .returning({ syncedAt: catalogSnapshots.syncedAt });
    // The conflict-update path leaves syncedAt at its original value, so a
    // row whose syncedAt equals this sync's timestamp was just created.
    const first = inserted[0];
    return first !== undefined && first.syncedAt === syncedAt ? "stored" : "touched";
  }

  async saveBrandProfile(profile: BrandProfile): Promise<void> {
    const validated = BrandProfileSchema.parse(profile);
    await this.db
      .update(merchants)
      .set({ brandProfile: JSON.stringify(validated), updatedAt: new Date().toISOString() })
      .where(eq(merchants.id, this.merchantId));
  }

  async upsertProduct(profile: ProductProfile, syncedAt: string): Promise<void> {
    const validated = ProductProfileSchema.parse(profile);
    const values = {
      storeId: this.merchantId,
      productId: validated.product_id,
      name: validated.name,
      pdpUrl: validated.url,
      payload: JSON.stringify(validated),
      // A product that reappears in a sync is live again — clear the
      // soft-delete marker rather than leave it lying.
      deletedAt: null,
      createdAt: syncedAt,
      updatedAt: syncedAt,
    };
    await this.db
      .insert(products)
      .values(values)
      .onConflictDoUpdate({
        target: [products.storeId, products.productId],
        set: {
          name: values.name,
          pdpUrl: values.pdpUrl,
          payload: values.payload,
          deletedAt: null,
          updatedAt: values.updatedAt,
        },
      });

    // Maintain the synced variant rows (spec D2). Upsert each variant of the
    // payload; stale rows are left — the product payload is the truth.
    for (const sku of validated.skus) {
      await this.db
        .insert(skus)
        .values({
          storeId: this.merchantId,
          productId: validated.product_id,
          skuId: sku.sku_id,
          name: sku.name ?? null,
          priceAmount: sku.price?.amount ?? null,
          priceCurrency: sku.price?.currency ?? null,
          createdAt: syncedAt,
          updatedAt: syncedAt,
        })
        .onConflictDoUpdate({
          target: [skus.storeId, skus.skuId],
          set: {
            productId: validated.product_id,
            name: sku.name ?? null,
            priceAmount: sku.price?.amount ?? null,
            priceCurrency: sku.price?.currency ?? null,
            updatedAt: syncedAt,
          },
        });
    }
  }

  async latestSnapshotRefs(): Promise<SnapshotRef[]> {
    const latest = await this.db
      .select({ syncedAt: catalogSnapshots.syncedAt })
      .from(catalogSnapshots)
      .where(eq(catalogSnapshots.storeId, this.merchantId))
      .orderBy(desc(catalogSnapshots.syncedAt))
      .limit(1);
    const batch = latest[0]?.syncedAt;
    if (batch === undefined) {
      return [];
    }
    const rows = await this.db
      .select({
        url: catalogSnapshots.url,
        contentHash: catalogSnapshots.contentHash,
        fetchedAt: catalogSnapshots.fetchedAt,
        storageRef: catalogSnapshots.storageRef,
      })
      .from(catalogSnapshots)
      .where(
        and(eq(catalogSnapshots.storeId, this.merchantId), eq(catalogSnapshots.syncedAt, batch)),
      );
    return rows.map((row) => ({
      url: row.url,
      content_hash: row.contentHash,
      fetched_at: row.fetchedAt,
      storage_ref: row.storageRef,
    }));
  }

  async getBrandProfile(): Promise<BrandProfile | null> {
    const row = await this.db
      .select({ brandProfile: merchants.brandProfile })
      .from(merchants)
      .where(eq(merchants.id, this.merchantId))
      .get();
    const raw = row?.brandProfile;
    if (raw === null || raw === undefined) {
      return null;
    }
    return BrandProfileSchema.parse(JSON.parse(raw));
  }

  async listProducts(): Promise<ProductRow[]> {
    const rows = await this.db
      .select({
        productId: products.productId,
        name: products.name,
        pdpUrl: products.pdpUrl,
        payload: products.payload,
        deletedAt: products.deletedAt,
      })
      .from(products)
      .where(eq(products.storeId, this.merchantId))
      .orderBy(products.productId);
    return rows.map((row) => ({
      product_id: row.productId,
      name: row.name,
      pdp_url: row.pdpUrl,
      payload: ProductProfileSchema.parse(JSON.parse(row.payload)),
      deleted_at: row.deletedAt,
    }));
  }

  async intentSummaries(): Promise<ExistingIntentSummary[]> {
    const rows = await this.listIntents();
    return rows.map((row) => summaryOf(row.record));
  }

  async saveIntents(records: readonly IntentRecord[]): Promise<void> {
    for (const record of records) {
      const validated = IntentRecordSchema.parse(record);
      await this.db
        .insert(intents)
        .values({
          storeId: this.merchantId,
          intentId: validated.intent_id,
          intentVersion: validated.intent_version,
          payload: JSON.stringify(validated),
          scope: validated.scope,
          brandId: validated.brand_id,
          intentCategory: validated.intent_category,
          buyerStage: validated.buyer_stage,
          country: validated.country,
          language: validated.language,
          createdAt: new Date().toISOString(),
        })
        .onConflictDoUpdate({
          target: [intents.storeId, intents.intentId, intents.intentVersion],
          set: { payload: JSON.stringify(validated) },
        });
    }
  }

  async listIntents(filters: IntentLibraryFilters = {}): Promise<IntentRow[]> {
    // Latest version per intent_id — the versioned library view.
    const conditions = [sql`i.store_id = ${this.merchantId}`];
    if (filters.scope !== undefined) conditions.push(sql`i.scope = ${filters.scope}`);
    if (filters.buyer_stage !== undefined) {
      conditions.push(sql`i.buyer_stage = ${filters.buyer_stage}`);
    }
    if (filters.intent_category !== undefined) {
      conditions.push(sql`i.intent_category = ${filters.intent_category}`);
    }
    if (filters.country !== undefined) conditions.push(sql`i.country = ${filters.country}`);
    if (filters.language !== undefined) conditions.push(sql`i.language = ${filters.language}`);

    const rows = await this.db.all<{
      intent_id: string;
      intent_version: number;
      payload: string;
    }>(sql`
      SELECT i.intent_id, i.intent_version, i.payload
      FROM intents i
      WHERE i.intent_version = (
        SELECT MAX(i2.intent_version) FROM intents i2
        WHERE i2.store_id = i.store_id AND i2.intent_id = i.intent_id
      )
      AND ${sql.join(conditions, sql` AND `)}
      ORDER BY i.intent_id
    `);
    return rows.map((row) => ({
      intent_id: row.intent_id,
      intent_version: row.intent_version,
      record: IntentRecordSchema.parse(JSON.parse(row.payload)),
    }));
  }

  async saveMappings(mappings: readonly SkuIntentMapping[]): Promise<void> {
    const now = new Date().toISOString();
    for (const mapping of mappings) {
      const validated = SkuIntentMappingSchema.parse(mapping);
      await this.db
        .insert(skuIntentMappings)
        .values({
          storeId: this.merchantId,
          mappingId: validated.mapping_id,
          intentId: validated.intent_id,
          skuId: validated.sku_id,
          productId: validated.product_id ?? null,
          payload: JSON.stringify(validated),
          // Regeneration reactivates a mapping it re-derives — invalidation
          // is only ever flipped back by evidence, never silently.
          active: true,
          invalidatedAt: null,
          createdAt: now,
        })
        .onConflictDoUpdate({
          target: [skuIntentMappings.storeId, skuIntentMappings.mappingId],
          set: {
            payload: JSON.stringify(validated),
            productId: validated.product_id ?? null,
            active: true,
            invalidatedAt: null,
          },
        });
    }
  }

  async listMappings(): Promise<MappingRow[]> {
    const rows = await this.db
      .select({
        mappingId: skuIntentMappings.mappingId,
        intentId: skuIntentMappings.intentId,
        skuId: skuIntentMappings.skuId,
        productId: skuIntentMappings.productId,
        payload: skuIntentMappings.payload,
        active: skuIntentMappings.active,
        invalidatedAt: skuIntentMappings.invalidatedAt,
      })
      .from(skuIntentMappings)
      .where(eq(skuIntentMappings.storeId, this.merchantId))
      .orderBy(skuIntentMappings.mappingId);
    return rows.map((row) => ({
      mapping_id: row.mappingId,
      intent_id: row.intentId,
      sku_id: row.skuId,
      product_id: row.productId,
      payload: SkuIntentMappingSchema.parse(JSON.parse(row.payload)),
      active: row.active,
      invalidated_at: row.invalidatedAt,
    }));
  }

  async markProductDeleted(productId: string, at: string): Promise<boolean> {
    const updated = await this.db
      .update(products)
      .set({ deletedAt: at, updatedAt: at })
      .where(
        and(
          eq(products.storeId, this.merchantId),
          eq(products.productId, productId),
          isNull(products.deletedAt),
        ),
      )
      .returning({ productId: products.productId });
    return updated.length > 0;
  }

  async invalidateProductMappings(productId: string, at: string): Promise<string[]> {
    const updated = await this.db
      .update(skuIntentMappings)
      .set({ active: false, invalidatedAt: at })
      .where(
        and(
          eq(skuIntentMappings.storeId, this.merchantId),
          eq(skuIntentMappings.productId, productId),
          eq(skuIntentMappings.active, true),
        ),
      )
      .returning({ intentId: skuIntentMappings.intentId });
    return [...new Set(updated.map((row) => row.intentId))];
  }

  async removeSkuReferences(skuIds: readonly string[]): Promise<string[]> {
    if (skuIds.length === 0) {
      return [];
    }
    const doomed = new Set(skuIds);
    const current = await this.listIntents();
    const affected: string[] = [];
    for (const row of current) {
      if (!row.record.sku_ids.some((skuId) => doomed.has(skuId))) {
        continue;
      }
      const updated: IntentRecord = IntentRecordSchema.parse({
        ...row.record,
        intent_version: row.intent_version + 1,
        sku_ids: row.record.sku_ids.filter((skuId) => !doomed.has(skuId)),
      });
      await this.saveIntents([updated]);
      affected.push(updated.intent_id);
    }
    return affected;
  }
}

// ── Row mappers ────────────────────────────────────────────────────────────

type MerchantDbRow = typeof merchants.$inferSelect;
type JobDbRow = typeof shopifyJobs.$inferSelect;

function merchantFromRow(row: MerchantDbRow): MerchantRecord {
  return {
    id: row.id,
    shop_domain: row.shopDomain,
    connected: row.connected,
    encrypted_access_token: row.encryptedAccessToken,
    granted_scopes: row.grantedScopes ? (JSON.parse(row.grantedScopes) as string[]) : [],
    brand_profile: row.brandProfile
      ? BrandProfileSchema.parse(JSON.parse(row.brandProfile))
      : null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

function jobFromRow(row: JobDbRow): ShopifyJobRecord {
  return {
    job_id: row.id,
    store_id: row.storeId,
    kind: row.kind as ShopifyJobKind,
    status: row.status as ShopifyJobStatus,
    status_history: JSON.parse(row.statusHistory) as ShopifyJobRecord["status_history"],
    error: row.error ? (JSON.parse(row.error) as ShopifyJobRecord["error"]) : null,
    result: row.result ? (JSON.parse(row.result) as ShopifyJobResult) : null,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

/** Persisted job row → insert values (the inverse of jobFromRow). */
export function jobToRow(job: ShopifyJobRecord): typeof shopifyJobs.$inferInsert {
  return {
    id: job.job_id,
    storeId: job.store_id,
    kind: job.kind,
    status: job.status,
    statusHistory: JSON.stringify(job.status_history),
    error: job.error ? JSON.stringify(job.error) : null,
    result: job.result ? JSON.stringify(job.result) : null,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
  };
}
