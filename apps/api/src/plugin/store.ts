/**
 * Read-side store for the plugin Phase I endpoints (design v1.4 §2,
 * testing plan Layer 4). Reads are always bound to one shop — the store
 * methods take the shop id and every query is scoped by it, mirroring the
 * Shopify store's structural tenant isolation.
 *
 * Adapter seam: the routes depend on `PluginReadStore`, not on Drizzle.
 * When the plugin-logic package merges, its calculators slot in behind
 * this seam without touching the route layer.
 */

import { asc, eq } from "drizzle-orm";

import {
  CommissionEntryContract,
  OrderAttributionContract,
  VisibilitySnapshotContract,
  affiliateVisits,
  aiReferralSessions,
  commissionEntries,
  intentPrompts,
  intentUnits,
  migratePluginDb,
  openPluginDb,
  orders,
  shops,
  visibilitySnapshots,
  type AiReferralSession,
  type AffiliateVisit,
  type CommissionEntry,
  type IntentPrompt,
  type IntentUnit,
  type OrderAttribution,
  type PluginDb,
  type VisibilitySnapshot,
} from "@intentvisible/plugin-schema";
import { parseStored, seedPluginDb } from "@intentvisible/plugin-schema/seed";

export interface PluginShopRow {
  shopId: string;
  shopDomain: string;
  isDemo: boolean;
  installedAt: string;
}

export interface IntentUnitRow extends IntentUnit {
  intentId: string;
  intentVersion: number;
  scope: "brand" | "product";
  prompts: IntentPrompt[];
  /** null when no snapshot row exists — the route normalizes to not_measured. */
  visibility: VisibilitySnapshot | null;
}

export interface AiReferralSessionRow extends AiReferralSession {
  landedIntentId: string | null;
}

export interface OrderRow {
  orderId: string;
  orderNumber: string;
  netSales: number;
  currency: string;
  attribution: OrderAttribution;
  isFirstOrder: boolean;
  refundedAt: string | null;
  orderedAt: string;
}

export interface CommissionRow {
  entryId: number;
  orderId: string;
  intentId: string | null;
  channel: string;
  trackingCode: string | null;
  entry: CommissionEntry;
  billedPeriodStart: string;
  billedPeriodEnd: string;
}

export interface AffiliateVisitRow extends AffiliateVisit {
  orderId: string | null;
}

/**
 * The plugin read surface, per shop. Order-sensitive reads (commission
 * ledger) return rows in insertion order so refund offsets follow the
 * entries they offset.
 */
export interface PluginReadStore {
  getShop(shopId: string): Promise<PluginShopRow | null>;
  listIntentUnits(shopId: string): Promise<IntentUnitRow[]>;
  listAiReferralSessions(shopId: string): Promise<AiReferralSessionRow[]>;
  listOrders(shopId: string): Promise<OrderRow[]>;
  listCommissionEntries(shopId: string): Promise<CommissionRow[]>;
  listAffiliateVisits(shopId: string): Promise<AffiliateVisitRow[]>;
}

/** Drizzle realization over the plugin-schema SQLite tables. */
export class DrizzlePluginReadStore implements PluginReadStore {
  constructor(private readonly db: PluginDb) {}

  async getShop(shopId: string): Promise<PluginShopRow | null> {
    const [row] = await this.db
      .select()
      .from(shops)
      .where(eq(shops.id, shopId))
      .limit(1);
    if (!row) {
      return null;
    }
    return {
      shopId: row.id,
      shopDomain: row.shopDomain,
      isDemo: row.isDemo,
      installedAt: row.installedAt,
    };
  }

  async listIntentUnits(shopId: string): Promise<IntentUnitRow[]> {
    const [unitRows, promptRows, snapshotRows] = await Promise.all([
      this.db.select().from(intentUnits).where(eq(intentUnits.shopId, shopId)).orderBy(asc(intentUnits.id)),
      this.db.select().from(intentPrompts).where(eq(intentPrompts.shopId, shopId)).orderBy(asc(intentPrompts.id)),
      this.db.select().from(visibilitySnapshots).where(eq(visibilitySnapshots.shopId, shopId)),
    ]);

    const promptsByIntent = new Map<string, IntentPrompt[]>();
    for (const row of promptRows) {
      const list = promptsByIntent.get(row.intentId) ?? [];
      list.push({ prompt_text: row.promptText, is_primary: row.isPrimary });
      promptsByIntent.set(row.intentId, list);
    }

    const visibilityByIntent = new Map<string, VisibilitySnapshot>();
    for (const row of snapshotRows) {
      visibilityByIntent.set(row.intentId, parseStored(VisibilitySnapshotContract, row.payload));
    }

    return unitRows.map((row) => ({
      intent_name: row.intentName,
      buyer_stage: row.buyerStage as IntentUnit["buyer_stage"],
      intent_category: row.intentCategory as IntentUnit["intent_category"],
      persona: row.persona,
      pain_point: row.painPoint,
      status: row.status as IntentUnit["status"],
      confidence: row.confidence as IntentUnit["confidence"],
      evidence_urls: row.evidenceUrls,
      intentId: row.intentId,
      intentVersion: row.intentVersion,
      scope: row.scope as IntentUnitRow["scope"],
      prompts: promptsByIntent.get(row.intentId) ?? [],
      visibility: visibilityByIntent.get(row.intentId) ?? null,
    }));
  }

  async listAiReferralSessions(shopId: string): Promise<AiReferralSessionRow[]> {
    const rows = await this.db
      .select()
      .from(aiReferralSessions)
      .where(eq(aiReferralSessions.shopId, shopId))
      .orderBy(asc(aiReferralSessions.id));
    return rows.map((row) => ({
      session_id: row.sessionId,
      source: row.source as AiReferralSession["source"],
      referrer_url: row.referrerUrl,
      landed_url: row.landedUrl,
      utm_source: row.utmSource,
      utm_medium: row.utmMedium,
      utm_campaign: row.utmCampaign,
      occurred_at: row.occurredAt,
      landedIntentId: row.landedIntentId,
    }));
  }

  async listOrders(shopId: string): Promise<OrderRow[]> {
    const rows = await this.db.select().from(orders).where(eq(orders.shopId, shopId)).orderBy(asc(orders.id));
    return rows.map((row) => ({
      orderId: row.orderId,
      orderNumber: row.orderNumber,
      netSales: row.netSales,
      currency: row.currency,
      attribution: parseStored(OrderAttributionContract, row.attribution),
      isFirstOrder: row.isFirstOrder,
      refundedAt: row.refundedAt,
      orderedAt: row.orderedAt,
    }));
  }

  async listCommissionEntries(shopId: string): Promise<CommissionRow[]> {
    const rows = await this.db
      .select()
      .from(commissionEntries)
      .where(eq(commissionEntries.shopId, shopId))
      .orderBy(asc(commissionEntries.id));
    return rows.map((row) => ({
      entryId: row.id,
      orderId: row.orderId,
      intentId: row.intentId,
      channel: row.channel,
      trackingCode: row.trackingCode,
      entry: parseStored(CommissionEntryContract, row.payload),
      billedPeriodStart: row.billedPeriodStart,
      billedPeriodEnd: row.billedPeriodEnd,
    }));
  }

  async listAffiliateVisits(shopId: string): Promise<AffiliateVisitRow[]> {
    const rows = await this.db
      .select()
      .from(affiliateVisits)
      .where(eq(affiliateVisits.shopId, shopId))
      .orderBy(asc(affiliateVisits.id));
    return rows.map((row) => ({
      visit_id: row.visitId,
      channel: row.channel as AffiliateVisit["channel"],
      partner: row.partner,
      tracking_code: row.trackingCode,
      landed_intent_id: row.landedIntentId,
      landed_at: row.landedAt,
      orderId: row.orderId,
    }));
  }
}

/**
 * Opens a plugin database, migrates it, and seeds the deterministic demo
 * world — the fixture-mode setup shared by the dev server and the tests.
 */
export async function openSeededPluginDb(url = ":memory:"): Promise<PluginDb> {
  const db = openPluginDb(url);
  await migratePluginDb(db);
  await seedPluginDb(db);
  return db;
}
