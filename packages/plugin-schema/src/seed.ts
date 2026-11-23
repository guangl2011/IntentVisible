/**
 * Deterministic demo seed for the plugin Phase I tables (local testing
 * plan — Test Dashboard Design). S2000-shaped intent units; one unit
 * intentionally left not_measured and one intentionally labeled as a
 * single-day snapshot, so the UI must surface the distinction rather
 * than present both as ordinary measurements.
 *
 * Pure builder + validating seeder: buildDemoSeed() returns plain rows
 * (testable, orderable), seedPluginDb(db) validates each row through its
 * contract and inserts it. No clocks, no randomness — two builds are
 * deep-equal.
 */

import type { z } from "zod";

import type { PluginDb } from "./client.js";
import {
  AiReferralSessionContract,
  AffiliateVisitContract,
  CommissionEntryContract,
  IntentPromptContract,
  IntentUnitContract,
  OrderAttributionContract,
  VisibilitySnapshotContract,
  type AiReferralSession,
  type AffiliateVisit,
  type CommissionEntry,
  type IntentPrompt,
  type IntentUnit,
  type OrderAttribution,
  type VisibilitySnapshot,
} from "./contracts.js";
import { affiliateVisits, aiReferralSessions, commissionEntries, intentPrompts, intentUnits, orders, shops, visibilitySnapshots } from "./schema.js";

/** Tenant id of the demo shop every seed row belongs to. */
export const DEMO_SHOP_ID = "shop_solix_demo";

/** Fixed "now" for the seed — all windows and events resolve against it. */
export const SEED_AS_OF = "2026-11-22";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export interface DemoSeed {
  shop: {
    id: string;
    shopDomain: string;
    isDemo: boolean;
    installedAt: string;
  };
  intentUnits: readonly (IntentUnit & {
    intentId: string;
    intentVersion: number;
    scope: "brand" | "product";
  })[];
  /** prompts grouped by intentId */
  promptsByIntent: Readonly<Record<string, readonly IntentPrompt[]>>;
  visibilityByIntent: Readonly<Record<string, VisibilitySnapshot>>;
  aiReferralSessions: readonly (AiReferralSession & { landedIntentId: string | null })[];
  orders: readonly {
    orderId: string;
    orderNumber: string;
    netSales: number;
    currency: string;
    attribution: OrderAttribution;
    isFirstOrder: boolean;
    refundedAt: string | null;
    orderedAt: string;
  }[];
  /**
   * Commission rows in insertion order; refund offsets always follow the
   * entry they offset (the ledger invariant assumes insert order).
   * offsetsSeedIndex resolves to the real entry id at insert time.
   */
  commissions: readonly (Omit<CommissionEntry, "offsets_entry_id"> & {
    orderId: string;
    intentId: string | null;
    channel: string;
    trackingCode: string | null;
    billedPeriodStart: string;
    billedPeriodEnd: string;
    /** Index into this array of the commission entry a refund_offset offsets. */
    offsetsSeedIndex: number | null;
  })[];
  affiliateVisits: readonly (AffiliateVisit & { orderId: string | null })[];
}

/** The S2000-shaped demo library: 3 measured units + 1 not_measured unit. */
export function buildDemoSeed(): DemoSeed {
  const seed: DemoSeed = {
    shop: {
      id: DEMO_SHOP_ID,
      shopDomain: "solix-demo.myshopify.com",
      isDemo: true,
      installedAt: "2026-11-01T09:00:00Z",
    },
    intentUnits: [
      {
        intentId: "intent_s2000_vs_rivals",
        intentVersion: 1,
        scope: "product",
        intent_name: "S2000 vs rival power stations",
        buyer_stage: "Comparison",
        intent_category: "Comparison",
        persona: "Overlanding weekend planner",
        pain_point: "Cannot tell whether S2000 outlasts a competitor's unit on a 3-day trip",
        status: "active",
        confidence: "high",
        evidence_urls: ["https://solix-demo.example.com/products/s2000"],
      },
      {
        intentId: "intent_how_long_fridge",
        intentVersion: 1,
        scope: "product",
        intent_name: "How long the S2000 runs a 12V fridge",
        buyer_stage: "Solution Research",
        intent_category: "Feature",
        persona: "Van-life weekend cook",
        pain_point: "Needs runtime math for a 12V fridge before trusting the spec sheet",
        status: "active",
        confidence: "medium",
        evidence_urls: ["https://solix-demo.example.com/products/s2000#runtime"],
      },
      {
        intentId: "intent_camping_power_rec",
        intentVersion: 1,
        scope: "brand",
        intent_name: "Camping power station recommendation",
        buyer_stage: "Consideration",
        intent_category: "Scenario",
        persona: "Family campsite organizer",
        pain_point: "Wants one recommendation that covers lights, a cooler, and phone charging",
        status: "active",
        confidence: "medium",
        evidence_urls: ["https://solix-demo.example.com/pages/camping-guide"],
      },
      {
        intentId: "intent_solar_sizing",
        intentVersion: 1,
        scope: "brand",
        intent_name: "Solar panel sizing for S2000",
        buyer_stage: "Solution Research",
        intent_category: "Compatibility",
        persona: "Off-grid cabin owner",
        pain_point: "Unsure which panel wattage recharges the S2000 in a day",
        status: "pending_review",
        confidence: "low",
        evidence_urls: ["https://solix-demo.example.com/pages/solar-guide"],
      },
    ],
    promptsByIntent: {
      intent_s2000_vs_rivals: [
        { prompt_text: "S2000 vs EcoFlow River 3 which lasts longer camping", is_primary: true },
        { prompt_text: "best 2000w power station comparison for overlanding", is_primary: false },
      ],
      intent_how_long_fridge: [
        { prompt_text: "how long will a power station run a 12v fridge", is_primary: true },
      ],
      intent_camping_power_rec: [
        { prompt_text: "what size power station do I need for family camping", is_primary: true },
        { prompt_text: "recommend a portable power station for a campsite", is_primary: false },
      ],
      intent_solar_sizing: [
        { prompt_text: "what watt solar panel charges a s2000 in one day", is_primary: true },
      ],
    },
    visibilityByIntent: {
      // Rolling 7-day window — the preferred measurement shape.
      intent_s2000_vs_rivals: {
        measurement_status: "measured",
        measurement_kind: "rolling",
        source_engines: ["chatgpt.com", "perplexity"],
        measurement_window_start: "2026-11-16",
        measurement_window_end: "2026-11-22",
        visibility_pct: 41.2,
        measurement_source: "intentvisible-monitor",
      },
      // Single-day snapshot — intentionally labeled so the UI down-ranks it.
      intent_how_long_fridge: {
        measurement_status: "measured",
        measurement_kind: "single_day",
        source_engines: ["chatgpt.com"],
        measurement_window_start: "2026-11-22",
        measurement_window_end: "2026-11-22",
        visibility_pct: 12.8,
        measurement_source: "intentvisible-monitor",
      },
      intent_camping_power_rec: {
        measurement_status: "measured",
        measurement_kind: "rolling",
        source_engines: ["chatgpt.com", "gemini", "perplexity"],
        measurement_window_start: "2026-11-09",
        measurement_window_end: "2026-11-22",
        visibility_pct: 27.5,
        measurement_source: "intentvisible-monitor",
      },
      // Left not_measured: null across the board, never an invented number.
      intent_solar_sizing: {
        measurement_status: "not_measured",
        measurement_kind: null,
        source_engines: null,
        measurement_window_start: null,
        measurement_window_end: null,
        visibility_pct: null,
        measurement_source: null,
      },
    },
    aiReferralSessions: [
      {
        session_id: "sess_ai_001",
        source: "chatgpt.com",
        referrer_url: "https://chatgpt.com/",
        landed_url: "https://solix-demo.example.com/products/s2000",
        landedIntentId: "intent_s2000_vs_rivals",
        utm_source: "chatgpt",
        utm_medium: "referral",
        utm_campaign: null,
        occurred_at: "2026-11-20T14:02:00Z",
      },
      {
        session_id: "sess_ai_002",
        source: "gemini",
        referrer_url: "https://gemini.google.com/",
        landed_url: "https://solix-demo.example.com/pages/camping-guide",
        landedIntentId: "intent_camping_power_rec",
        utm_source: "gemini",
        utm_medium: "referral",
        utm_campaign: null,
        occurred_at: "2026-11-21T08:15:00Z",
      },
      {
        session_id: "sess_ai_003",
        source: "perplexity",
        referrer_url: "https://www.perplexity.ai/",
        landed_url: "https://solix-demo.example.com/products/s2000#runtime",
        landedIntentId: "intent_how_long_fridge",
        utm_source: "perplexity",
        utm_medium: "referral",
        utm_campaign: null,
        occurred_at: "2026-11-21T19:44:00Z",
      },
      {
        session_id: "sess_ai_004",
        source: "chatgpt.com",
        referrer_url: "https://chatgpt.com/",
        landed_url: "https://solix-demo.example.com/pages/solar-guide",
        landedIntentId: "intent_solar_sizing",
        utm_source: "chatgpt",
        utm_medium: "referral",
        utm_campaign: null,
        occurred_at: "2026-11-22T10:30:00Z",
      },
      {
        session_id: "sess_ai_005",
        source: "perplexity",
        referrer_url: "https://www.perplexity.ai/",
        landed_url: "https://solix-demo.example.com/products/s2000",
        landedIntentId: "intent_s2000_vs_rivals",
        utm_source: "perplexity",
        utm_medium: "referral",
        utm_campaign: null,
        occurred_at: "2026-11-22T16:05:00Z",
      },
    ],
    orders: [
      // Standard UTM-attributed affiliate order → pending commission.
      {
        orderId: "ord_1001",
        orderNumber: "#1001",
        netSales: 249,
        currency: "USD",
        attribution: {
          attribution_basis: "utm",
          utm_source: "perplexity",
          utm_medium: "referral",
          utm_campaign: "intent-s2000",
          click_id: null,
          discount_codes: [],
          channel_group: "ai_referral",
        },
        isFirstOrder: true,
        refundedAt: null,
        orderedAt: "2026-11-21T15:10:00Z",
      },
      // Confirmed then refunded → refund_offset row in the ledger.
      {
        orderId: "ord_1002",
        orderNumber: "#1002",
        netSales: 499,
        currency: "USD",
        attribution: {
          attribution_basis: "utm",
          utm_source: "chatgpt",
          utm_medium: "referral",
          utm_campaign: "intent-camping",
          click_id: null,
          discount_codes: [],
          channel_group: "ai_referral",
        },
        isFirstOrder: false,
        refundedAt: "2026-11-23T09:00:00Z",
        orderedAt: "2026-11-19T11:25:00Z",
      },
      // Discount-code-only order: no UTM, hard-attributed by the code.
      {
        orderId: "ord_1003",
        orderNumber: "#1003",
        netSales: 899,
        currency: "USD",
        attribution: {
          attribution_basis: "discount_code",
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          click_id: null,
          discount_codes: ["WELCOME10"],
          channel_group: "discount_code",
        },
        isFirstOrder: false,
        refundedAt: null,
        orderedAt: "2026-11-20T20:40:00Z",
      },
      // Dark traffic: genuinely unattributed — deliberately never billed.
      {
        orderId: "ord_1004",
        orderNumber: "#1004",
        netSales: 149,
        currency: "USD",
        attribution: {
          attribution_basis: "unattributed",
          utm_source: null,
          utm_medium: null,
          utm_campaign: null,
          click_id: null,
          discount_codes: [],
          channel_group: "direct",
        },
        isFirstOrder: false,
        refundedAt: null,
        orderedAt: "2026-11-22T07:55:00Z",
      },
    ],
    commissions: [
      {
        entry_type: "commission",
        status: "pending",
        rate: 0.1,
        base_amount: 249,
        amount: round2(249 * 0.1),
        orderId: "ord_1001",
        intentId: "intent_s2000_vs_rivals",
        channel: "play",
        trackingCode: "IV-PLAY-S2000",
        billedPeriodStart: "2026-11-21",
        billedPeriodEnd: "2026-11-21",
        offsetsSeedIndex: null,
      },
      {
        entry_type: "commission",
        // Status stays "confirmed" — the refund is recorded as the
        // refund_offset row below, never as a destructive status edit.
        status: "confirmed",
        rate: 0.1,
        base_amount: 499,
        amount: round2(499 * 0.1),
        orderId: "ord_1002",
        intentId: "intent_camping_power_rec",
        channel: "play",
        trackingCode: "IV-PLAY-CAMP",
        billedPeriodStart: "2026-11-19",
        billedPeriodEnd: "2026-11-19",
        offsetsSeedIndex: null,
      },
      {
        entry_type: "refund_offset",
        status: "refunded",
        rate: 0.1,
        base_amount: 499,
        amount: -round2(499 * 0.1),
        orderId: "ord_1002",
        intentId: "intent_camping_power_rec",
        channel: "play",
        trackingCode: "IV-PLAY-CAMP",
        billedPeriodStart: "2026-11-23",
        billedPeriodEnd: "2026-11-23",
        offsetsSeedIndex: 1,
      },
      {
        entry_type: "commission",
        status: "confirmed",
        rate: 0.08,
        base_amount: 899,
        amount: round2(899 * 0.08),
        orderId: "ord_1003",
        intentId: "intent_how_long_fridge",
        channel: "ads",
        trackingCode: "IV-ADS-FRIDGE",
        billedPeriodStart: "2026-11-20",
        billedPeriodEnd: "2026-11-20",
        offsetsSeedIndex: null,
      },
      // ord_1004 is unattributed by design — no commission row exists for it.
    ],
    affiliateVisits: [
      {
        visit_id: "visit_001",
        channel: "play",
        partner: "overland-digest",
        tracking_code: "IV-PLAY-S2000",
        landed_intent_id: "intent_s2000_vs_rivals",
        orderId: "ord_1001",
        landed_at: "2026-11-21T14:58:00Z",
      },
      {
        visit_id: "visit_002",
        channel: "play",
        partner: "vanlife-weekly",
        tracking_code: "IV-PLAY-CAMP",
        landed_intent_id: "intent_camping_power_rec",
        orderId: "ord_1002",
        landed_at: "2026-11-19T11:02:00Z",
      },
      {
        visit_id: "visit_003",
        channel: "ads",
        partner: "search-ads",
        tracking_code: "IV-ADS-FRIDGE",
        landed_intent_id: "intent_how_long_fridge",
        orderId: "ord_1003",
        landed_at: "2026-11-20T20:12:00Z",
      },
      {
        visit_id: "visit_004",
        channel: "play",
        partner: "overland-digest",
        tracking_code: "IV-PLAY-S2000",
        landed_intent_id: "intent_s2000_vs_rivals",
        orderId: null,
        landed_at: "2026-11-22T18:20:00Z",
      },
    ],
  };
  return seed;
}

/**
 * Validates and inserts the demo seed into an already-migrated database.
 * Throws on any contract violation — a seed that fails its own red lines
 * must fail loudly, not seed a misleading dashboard.
 */
export async function seedPluginDb(db: PluginDb, seed: DemoSeed = buildDemoSeed()): Promise<void> {
  await db.insert(shops).values({
    id: seed.shop.id,
    shopDomain: seed.shop.shopDomain,
    isDemo: seed.shop.isDemo,
    installedAt: seed.shop.installedAt,
  });

  for (const unit of seed.intentUnits) {
    const validated = IntentUnitContract.parse({
      intent_name: unit.intent_name,
      buyer_stage: unit.buyer_stage,
      intent_category: unit.intent_category,
      persona: unit.persona,
      pain_point: unit.pain_point,
      status: unit.status,
      confidence: unit.confidence,
      evidence_urls: unit.evidence_urls,
    });
    await db.insert(intentUnits).values({
      shopId: seed.shop.id,
      intentId: unit.intentId,
      intentVersion: unit.intentVersion,
      intentName: validated.intent_name,
      scope: unit.scope,
      buyerStage: validated.buyer_stage,
      intentCategory: validated.intent_category,
      persona: validated.persona,
      painPoint: validated.pain_point,
      status: validated.status,
      confidence: validated.confidence,
      evidenceUrls: validated.evidence_urls,
      createdAt: "2026-11-01T09:00:00Z",
    });
  }

  for (const [intentId, prompts] of Object.entries(seed.promptsByIntent)) {
    for (const prompt of prompts) {
      const validated = IntentPromptContract.parse(prompt);
      await db.insert(intentPrompts).values({
        shopId: seed.shop.id,
        intentId,
        promptText: validated.prompt_text,
        isPrimary: validated.is_primary,
        createdAt: "2026-11-01T09:00:00Z",
      });
    }
  }

  for (const [intentId, snapshot] of Object.entries(seed.visibilityByIntent)) {
    const validated = VisibilitySnapshotContract.parse(snapshot);
    await db.insert(visibilitySnapshots).values({
      shopId: seed.shop.id,
      intentId,
      payload: JSON.stringify(validated),
      updatedAt: "2026-11-22T12:00:00Z",
    });
  }

  for (const session of seed.aiReferralSessions) {
    const validated = AiReferralSessionContract.parse({
      session_id: session.session_id,
      source: session.source,
      referrer_url: session.referrer_url,
      landed_url: session.landed_url,
      utm_source: session.utm_source,
      utm_medium: session.utm_medium,
      utm_campaign: session.utm_campaign,
      occurred_at: session.occurred_at,
    });
    await db.insert(aiReferralSessions).values({
      shopId: seed.shop.id,
      sessionId: validated.session_id,
      source: validated.source,
      referrerUrl: validated.referrer_url,
      landedUrl: validated.landed_url,
      landedIntentId: session.landedIntentId,
      utmSource: validated.utm_source,
      utmMedium: validated.utm_medium,
      utmCampaign: validated.utm_campaign,
      occurredAt: validated.occurred_at,
    });
  }

  for (const order of seed.orders) {
    const attribution = OrderAttributionContract.parse(order.attribution);
    await db.insert(orders).values({
      shopId: seed.shop.id,
      orderId: order.orderId,
      orderNumber: order.orderNumber,
      netSales: order.netSales,
      currency: order.currency,
      attribution: JSON.stringify(attribution),
      isFirstOrder: order.isFirstOrder,
      refundedAt: order.refundedAt,
      orderedAt: order.orderedAt,
    });
  }

  const insertedCommissionIds: number[] = [];
  for (const commission of seed.commissions) {
    // Resolve refund offsets to the real entry id at insert time — a
    // refund_offset whose target never landed fails the contract loudly.
    const offsetsEntryId =
      commission.offsetsSeedIndex === null
        ? null
        : (insertedCommissionIds[commission.offsetsSeedIndex] ?? null);
    const validated = CommissionEntryContract.parse({
      entry_type: commission.entry_type,
      status: commission.status,
      rate: commission.rate,
      base_amount: commission.base_amount,
      amount: commission.amount,
      offsets_entry_id: offsetsEntryId,
    });
    const [inserted] = await db
      .insert(commissionEntries)
      .values({
        shopId: seed.shop.id,
        orderId: commission.orderId,
        intentId: commission.intentId,
        channel: commission.channel,
        trackingCode: commission.trackingCode,
        payload: JSON.stringify(validated),
        billedPeriodStart: commission.billedPeriodStart,
        billedPeriodEnd: commission.billedPeriodEnd,
        createdAt: "2026-11-23T09:00:00Z",
      })
      .returning({ id: commissionEntries.id });
    if (commission.entry_type === "commission") {
      insertedCommissionIds.push(inserted?.id ?? -1);
    }
  }

  for (const visit of seed.affiliateVisits) {
    const validated = AffiliateVisitContract.parse({
      visit_id: visit.visit_id,
      channel: visit.channel,
      partner: visit.partner,
      tracking_code: visit.tracking_code,
      landed_intent_id: visit.landed_intent_id,
      landed_at: visit.landed_at,
    });
    await db.insert(affiliateVisits).values({
      shopId: seed.shop.id,
      visitId: validated.visit_id,
      channel: validated.channel,
      partner: validated.partner,
      trackingCode: validated.tracking_code,
      landedIntentId: visit.landed_intent_id,
      orderId: visit.orderId,
      landedAt: validated.landed_at,
    });
  }
}

/** Parses a stored contract payload back through its schema (read path). */
export function parseStored<T extends z.ZodTypeAny>(contract: T, raw: string): z.infer<T> {
  return contract.parse(JSON.parse(raw));
}
