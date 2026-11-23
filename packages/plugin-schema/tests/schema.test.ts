import { beforeEach, describe, expect, it } from "vitest";

import * as schema from "../src/schema.js";
import { migratePluginDb, openPluginDb, type PluginDb } from "../src/index.js";
import { DEMO_SHOP_ID, seedPluginDb } from "../src/seed.js";

let db: PluginDb;

beforeEach(async () => {
  db = openPluginDb(":memory:");
  await migratePluginDb(db);
  await seedPluginDb(db);
});

describe("migration applies", () => {
  it("creates all plugin Phase I tables and is idempotent", async () => {
    // Re-running the migration on a populated db must not throw or duplicate.
    await migratePluginDb(db);
    const tables = await db.$client.execute(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
    );
    const names = tables.rows.map((r) => String(r.name));
    for (const expected of [
      "shops",
      "intent_units",
      "intent_prompts",
      "visibility_snapshots",
      "ai_referral_sessions",
      "orders",
      "commission_entries",
      "affiliate_visits",
    ]) {
      expect(names).toContain(expected);
    }
  });
});

describe("tenant isolation", () => {
  it("carries shop_id on every table (structural, per design §1.5)", () => {
    for (const table of [
      schema.intentUnits,
      schema.intentPrompts,
      schema.visibilitySnapshots,
      schema.aiReferralSessions,
      schema.orders,
      schema.commissionEntries,
      schema.affiliateVisits,
    ]) {
      const columns = Object.keys(table);
      expect(columns.length, "table must expose columns").toBeGreaterThan(0);
      expect(columns, `${table} must be tenant-scoped`).toContain("shopId");
    }
  });

  it("seeds everything under one demo tenant", async () => {
    const shops = await db.$client.execute("SELECT id, is_demo FROM shops");
    expect(shops.rows).toHaveLength(1);
    expect(shops.rows[0]?.id).toBe(DEMO_SHOP_ID);
    expect(shops.rows[0]?.is_demo).toBe(1);
  });
});
