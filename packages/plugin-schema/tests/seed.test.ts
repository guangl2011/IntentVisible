import { describe, expect, it } from "vitest";

import { buildDemoSeed, DEMO_SHOP_ID, seedPluginDb } from "../src/seed.js";
import { openPluginDb, migratePluginDb } from "../src/index.js";

describe("demo seed shape (test plan: Test Dashboard Design)", () => {
  it("is deterministic — two builds are deep-equal", () => {
    expect(buildDemoSeed()).toEqual(buildDemoSeed());
  });

  it("uses S2000-shaped intent units with persona, stage, and pain point", () => {
    const seed = buildDemoSeed();
    const names = seed.intentUnits.map((u) => u.intent_name);
    expect(names.some((n) => n.toLowerCase().includes("s2000"))).toBe(true);
    expect(names.some((n) => n.toLowerCase().includes("how long"))).toBe(true);
    expect(names.some((n) => n.toLowerCase().includes("camping"))).toBe(true);
    for (const unit of seed.intentUnits) {
      expect(unit.persona.length).toBeGreaterThan(0);
      expect(unit.pain_point.length).toBeGreaterThan(0);
      expect(unit.buyer_stage.length).toBeGreaterThan(0);
      expect(unit.intent_category.length).toBeGreaterThan(0);
      expect(unit.evidence_urls.length).toBeGreaterThan(0);
    }
  });

  it("every intent unit has prompts", () => {
    const seed = buildDemoSeed();
    for (const unit of seed.intentUnits) {
      const prompts = seed.promptsByIntent[unit.intentId];
      expect(prompts?.length ?? 0, `${unit.intentId} must carry prompts`).toBeGreaterThan(0);
      expect(prompts?.some((p) => p.is_primary) ?? false).toBe(true);
    }
  });

  it("leaves exactly one unit not_measured", () => {
    const seed = buildDemoSeed();
    const notMeasured = Object.entries(seed.visibilityByIntent).filter(
      ([, v]) => v.measurement_status === "not_measured",
    );
    expect(notMeasured).toHaveLength(1);
    expect(notMeasured[0]?.[0]).toBe("intent_solar_sizing");
  });

  it("labels exactly one unit as a single-day snapshot", () => {
    const seed = buildDemoSeed();
    const singleDay = Object.entries(seed.visibilityByIntent).filter(
      ([, v]) => v.measurement_kind === "single_day",
    );
    expect(singleDay).toHaveLength(1);
    expect(singleDay[0]?.[0]).toBe("intent_how_long_fridge");
  });

  it("covers all three AI-referral sources and carries a refund-offset ledger row", () => {
    const seed = buildDemoSeed();
    const sources = new Set(seed.aiReferralSessions.map((s) => s.source));
    expect([...sources].sort()).toEqual(["chatgpt.com", "gemini", "perplexity"].sort());

    expect(seed.commissions.some((c) => c.entry_type === "refund_offset")).toBe(true);
    expect(seed.affiliateVisits.some((v) => v.orderId !== null)).toBe(true);
    expect(seed.affiliateVisits.some((v) => v.orderId === null)).toBe(true);
    expect(seed.shop.id).toBe(DEMO_SHOP_ID);
  });

  it("inserts cleanly into a migrated database and guards duplicates", async () => {
    const db = openPluginDb(":memory:");
    await migratePluginDb(db);
    await expect(seedPluginDb(db)).resolves.toBeUndefined();
    // Duplicate session insert must fail on the unique index.
    await expect(seedPluginDb(db)).rejects.toThrow();
  });
});
