/**
 * Deterministic generator tests (spec art_Aj4HcWgx, section D3 + spec
 * verification table rows "Deterministic generator emits records that
 * respect the measurement invariant" and "Re-runs dedupe instead of
 * duplicating"). Fixture catalog profiles only — no LLM, no network.
 */

import { describe, expect, it } from "vitest";

import { IntentRecordSchema, SnapshotRefSchema, type SnapshotRef } from "@intentvisible/core-schema";

import { DeterministicIntentGenerator } from "../src/deterministic.js";
import { summaryOf } from "../src/dedup.js";
import type { GenerationRun } from "../src/generate.js";
import { FakeClock } from "./test-doubles.js";
import { AU_MARKET, BRAND, DOMAIN, PDP_URL, PRODUCT, SNAPSHOT } from "./fixtures.js";

/** The sync's Admin API source — the second citable evidence surface. */
const ADMIN_API_URL = `https://${DOMAIN}/admin/api/catalog-snapshot.json`;
const ADMIN_SNAPSHOT: SnapshotRef = SnapshotRefSchema.parse({
  url: ADMIN_API_URL,
  content_hash: "sha256:fixture-admin",
  fetched_at: "2026-10-30T00:00:00.000Z",
  storage_ref: `${"c".repeat(64)}`,
});

function run(overrides: Partial<GenerationRun> = {}): GenerationRun {
  return {
    markets: [AU_MARKET],
    snapshots: [SNAPSHOT, ADMIN_SNAPSHOT],
    ...overrides,
  };
}

function generator(): DeterministicIntentGenerator {
  return new DeterministicIntentGenerator({ clock: new FakeClock() });
}

describe("DeterministicIntentGenerator — catalog derivation", () => {
  it("derives brand-scope Category Question and Scenario intents from store-declared material", async () => {
    const outcome = await generator().generateBrandIntents(BRAND, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records.map((record) => record.intent_category)).toEqual([
      "Category Question",
      "Scenario",
      "Scenario",
    ]);
    expect(outcome.records.map((record) => record.intent_name)).toEqual([
      "What is portable power station?",
      "camping fridge power scenarios",
      "weekend off-grid trips scenarios",
    ]);
    expect(outcome.records.every((record) => record.scope === "brand")).toBe(true);
    expect(outcome.records.every((record) => record.sku_ids.length === 0)).toBe(true);
    expect(outcome.report.dropped).toEqual([]);
  });

  it("derives product-scope Feature, Price, Purchase Conditions, and Scenario intents", async () => {
    const outcome = await generator().generateProductIntents(PRODUCT, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.records.map((record) => record.intent_category)).toEqual([
      "Feature",
      "Feature",
      "Feature",
      "Feature",
      "Price",
      "Purchase Conditions",
      "Scenario",
      "Scenario",
    ]);
    const byName = new Map(outcome.records.map((record) => [record.intent_name, record]));
    expect(byName.get("Capacity: 993Wh")?.buyer_stage).toBe("Solution Research");
    expect(byName.get("ExampleBrand 1000 Portable Power Station price")?.buyer_stage).toBe(
      "Purchase Decision",
    );
    const price = byName.get("ExampleBrand 1000 Portable Power Station price");
    expect(price?.recommended_content).toContain("999 AUD");
    // Product-scope intents cover the product: every evidenced SKU is referenced.
    expect(outcome.records.every((record) => record.sku_ids.join(",") === "sku_example_01,sku_example_02")).toBe(
      true,
    );
  });

  it("labels the price intent with a SKU price range when SKUs are priced", async () => {
    const priced = {
      ...PRODUCT,
      skus: PRODUCT.skus.map((sku, index) => ({ ...sku, price: { amount: 999 + index * 100, currency: "AUD" } })),
    };
    const outcome = await generator().generateProductIntents(priced, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const price = outcome.records.find((record) => record.intent_category === "Price");
    expect(price?.recommended_content).toContain("999–1099 AUD");
  });
});

describe("DeterministicIntentGenerator — standalone invariants", () => {
  it("every emitted record passes core-schema Zod validation", async () => {
    const outcome = await generator().generateProductIntents(PRODUCT, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    for (const record of outcome.records) {
      expect(IntentRecordSchema.safeParse(record).success).toBe(true);
    }
  });

  it("every record is not_measured with null measured fields and extraction provenance", async () => {
    const outcome = await generator().generateProductIntents(PRODUCT, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    for (const record of outcome.records) {
      expect(record.measurement_status).toBe("not_measured");
      expect(record.measurement_source).toBeNull();
      expect(record.visibility_pct).toBeNull();
      expect(record.monthly_search_volume).toBeNull();
      expect(record.generation_method).toBe("deterministic_extraction");
      expect(record.generation_model).toBeUndefined();
      expect(record.opportunity_type).toBe("hypothesis");
    }
  });

  it("every record cites the storefront PDP and the Admin API source", async () => {
    const brand = await generator().generateBrandIntents(BRAND, run());
    const product = await generator().generateProductIntents(PRODUCT, run());
    expect(brand.ok && product.ok).toBe(true);
    if (!brand.ok || !product.ok) return;
    for (const record of [...brand.records, ...product.records]) {
      expect(record.evidence_urls).toEqual([PDP_URL, ADMIN_API_URL]);
    }
  });

  it("mappings carry unverified eligibility, the PDP landing url, and stable ids", async () => {
    const outcome = await generator().generateProductIntents(PRODUCT, run());
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.mappings).toHaveLength(outcome.records.length * PRODUCT.skus.length);
    for (const mapping of outcome.mappings) {
      expect(mapping.eligibility).toBe("unverified");
      expect(mapping.landing_url).toBe(PRODUCT.url);
      expect(mapping.product_id).toBe(PRODUCT.product_id);
      expect(mapping.evidence_urls).toEqual([PDP_URL, ADMIN_API_URL]);
    }
    const first = outcome.mappings[0];
    expect(first?.mapping_id).toBe("map_int_993wh_lifepo4_battery_sku_example_01");
  });

  it("runs with a clock only — construction requires no adapter and makes no network calls", async () => {
    // The deps type carries no adapter: the deterministic path is structurally
    // incapable of an LLM call, which is the no-network guarantee under test.
    const generator = new DeterministicIntentGenerator({ clock: new FakeClock() });
    const outcome = await generator.generateBrandIntents(BRAND, run());
    expect(outcome.ok).toBe(true);
  });
});

describe("DeterministicIntentGenerator — re-run dedupe", () => {
  it("same input twice yields an identical intent_id set with unchanged versions", async () => {
    const gen = generator();
    const first = await gen.generateBrandIntents(BRAND, run());
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = await gen.generateBrandIntents(BRAND, run({ existing: first.records.map(summaryOf) }));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(new Set(second.records.map((record) => record.intent_id))).toEqual(
      new Set(first.records.map((record) => record.intent_id)),
    );
    const versionsBefore = new Map(first.records.map((record) => [record.intent_id, record.intent_version]));
    for (const record of second.records) {
      expect(record.intent_version).toBe(versionsBefore.get(record.intent_id));
    }
    expect(second.report).toMatchObject({ kept: first.records.length, reused: first.records.length, fresh: 0 });
  });

  it("a changed catalog input bumps the version of the changed intent only", async () => {
    const gen = generator();
    const first = await gen.generateProductIntents(PRODUCT, run());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    // Price change (content change under a stable identity) plus one new feature.
    const changed = {
      ...PRODUCT,
      price: { amount: 1099, currency: "AUD" },
      features: [...PRODUCT.features, "USB-C fast input"],
    };
    const second = await gen.generateProductIntents(changed, run({ existing: first.records.map(summaryOf) }));
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const before = new Map(first.records.map((record) => [record.intent_id, record]));
    const after = new Map(second.records.map((record) => [record.intent_name, record]));

    // The price intent keeps its id and bumps exactly one version.
    const priceName = "ExampleBrand 1000 Portable Power Station price";
    const firstPrice = first.records.find((record) => record.intent_name === priceName);
    const price = after.get(priceName);
    expect(price?.intent_id).toBe(firstPrice?.intent_id);
    expect(price?.intent_version).toBe((firstPrice?.intent_version ?? 0) + 1);
    expect(price?.recommended_content).toContain("1099 AUD");

    // The new feature mints a fresh id at version 1.
    const added = after.get("USB-C fast input");
    expect(added?.intent_id).toBe("int_usb_c_fast_input");
    expect(added?.intent_version).toBe(1);

    // Every other intent kept both its id and its version.
    const untouched = second.records.filter(
      (record) => record.intent_name !== priceName && record.intent_name !== "USB-C fast input",
    );
    expect(untouched).toHaveLength(first.records.length - 1);
    for (const record of untouched) {
      const previous = before.get(record.intent_id);
      expect(previous).toBeDefined();
      expect(record.intent_version).toBe(previous?.intent_version);
    }

    // Mapping ids are stable across the bump — stores can upsert idempotently.
    const priceMappingId = (intentId: string | undefined): string | undefined =>
      second.mappings.find((mapping) => mapping.intent_id === intentId && mapping.sku_id === "sku_example_01")
        ?.mapping_id;
    expect(priceMappingId(price?.intent_id)).toBeDefined();
    expect(priceMappingId(price?.intent_id)).toEqual(
      first.mappings.find(
        (mapping) => mapping.intent_id === firstPrice?.intent_id && mapping.sku_id === "sku_example_01",
      )?.mapping_id,
    );
  });
});

describe("DeterministicIntentGenerator — guards", () => {
  it("refuses to run without stored snapshots", async () => {
    const outcome = await generator().generateBrandIntents(BRAND, { markets: [AU_MARKET], snapshots: [] });
    expect(outcome).toMatchObject({ ok: false, reason: "no_evidence" });
  });

  it("fails as generation_empty when nothing is derivable", async () => {
    const bare = {
      ...PRODUCT,
      price: undefined,
      features: [],
      specifications: [],
      use_cases: [],
      shipping_and_returns: undefined,
      skus: [],
    };
    const outcome = await generator().generateProductIntents(bare, run());
    expect(outcome).toMatchObject({ ok: false, reason: "generation_empty" });
  });

  it("rejects an empty market list with a TypeError", async () => {
    await expect(generator().generateBrandIntents(BRAND, { markets: [], snapshots: [SNAPSHOT] })).rejects.toThrow(
      TypeError,
    );
  });

  it("caps candidates per market in derivation order", async () => {
    const outcome = await generator().generateBrandIntents(BRAND, run({ max_candidates_per_market: 2 }));
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.report.candidates).toBe(3);
    expect(outcome.report.kept).toBe(2);
    expect(outcome.records.map((record) => record.intent_name)).toEqual([
      "What is portable power station?",
      "camping fridge power scenarios",
    ]);
  });
});
