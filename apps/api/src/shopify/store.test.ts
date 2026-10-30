/**
 * Persistence-layer tests: merchant isolation (structural scoping), the
 * core-schema validation contract on persisted profiles, and the soft/
 * versioned webhook edge behavior. Sync data is produced through the real
 * runner on the connector's recorded fixtures — no hand-built rows.
 */

import { describe, expect, it } from "vitest";

import { BrandProfileSchema, ProductProfileSchema } from "@intentvisible/core-schema";
import { decryptToken } from "./secrets.js";
import { createShopifyJob, runIntentGenerationJob } from "./runner.js";
import {
  DERIVED_PRODUCT_ID,
  makeDeps,
  seededDeps,
  syncedDeps,
  TEST_STORE_ID,
  TEST_TOKEN_KEY,
} from "./test-helpers.js";

describe("merchant scoping (structural)", () => {
  it("one merchant's reads never return another merchant's rows", async () => {
    const deps = await syncedDeps();
    const acme = deps.store.forMerchant(TEST_STORE_ID);
    const rival = deps.store.forMerchant("store_other_merchant");

    // Synced catalog belongs to acme alone.
    expect((await acme.listProducts()).map((row) => row.product_id)).toEqual([
      "product_98765432100",
      "product_98765432101",
      "product_98765432102",
    ]);
    expect(await rival.listProducts()).toEqual([]);
    expect(await acme.getBrandProfile()).not.toBeNull();
    expect(await rival.getBrandProfile()).toBeNull();

    // Snapshot refs are scoped: the rival has no citable evidence.
    expect((await acme.latestSnapshotRefs()).length).toBeGreaterThan(0);
    expect(await rival.latestSnapshotRefs()).toEqual([]);
  });

  it("persisted intents and mappings never cross merchants", async () => {
    const deps = await seededDeps();
    const job = await createShopifyJob(deps.store, TEST_STORE_ID, "intent_generation");
    await runIntentGenerationJob(deps, job);

    const acme = deps.store.forMerchant(TEST_STORE_ID);
    const rival = deps.store.forMerchant("store_other_merchant");

    const acmeIntents = await acme.listIntents();
    expect(acmeIntents.length).toBeGreaterThan(0);
    expect(await rival.listIntents()).toEqual([]);
    expect((await acme.listMappings()).length).toBeGreaterThan(0);
    expect(await rival.listMappings()).toEqual([]);
  });
});

describe("persistence contracts", () => {
  it("persisted brand and product profiles pass core-schema Zod schemas", async () => {
    const deps = await syncedDeps();
    const scoped = deps.store.forMerchant(TEST_STORE_ID);

    const brand = await scoped.getBrandProfile();
    expect(brand).not.toBeNull();
    expect(BrandProfileSchema.parse(brand)).toEqual(brand);

    const products = await scoped.listProducts();
    for (const row of products) {
      expect(ProductProfileSchema.parse(row.payload)).toEqual(row.payload);
    }
  });

  it("the stored access token decrypts with the deployment key", async () => {
    const deps = await syncedDeps();
    const merchant = await deps.store.getMerchant(TEST_STORE_ID);
    expect(merchant?.encrypted_access_token).not.toBeNull();
    expect(decryptToken(merchant?.encrypted_access_token ?? "", TEST_TOKEN_KEY)).toBe(
      "shpat_fixture_token",
    );
  });

  it("a re-install upsert preserves the synced brand profile", async () => {
    const deps = await syncedDeps();
    const merchant = await deps.store.getMerchant(TEST_STORE_ID);
    expect(merchant).not.toBeNull();

    // Reconnect (as a reinstall would): brand_profile must survive.
    await deps.store.upsertMerchant({
      ...(merchant as NonNullable<Awaited<ReturnType<typeof deps.store.getMerchant>>>),
      brand_profile: null,
      updated_at: new Date().toISOString(),
    });
    expect(await deps.store.forMerchant(TEST_STORE_ID).getBrandProfile()).not.toBeNull();
  });
});

describe("webhook edge behavior in the store", () => {
  it("webhook delivery dedupe: the same id records once", async () => {
    const deps = await makeDeps();
    const delivery = {
      webhookId: "b86f2d1e-0001",
      topic: "app/uninstalled",
      shopDomain: "acme-fixtures.myshopify.com",
      processedAt: new Date().toISOString(),
    };
    expect(await deps.store.recordWebhookDelivery(delivery)).toBe(true);
    expect(await deps.store.recordWebhookDelivery(delivery)).toBe(false);
  });

  it("oauth state is single-use", async () => {
    const deps = await makeDeps();
    await deps.store.saveOAuthState("acme-fixtures.myshopify.com", "nonce-1");
    expect(await deps.store.getOAuthState("acme-fixtures.myshopify.com")).toBe("nonce-1");
    await deps.store.consumeOAuthState("acme-fixtures.myshopify.com");
    expect(await deps.store.getOAuthState("acme-fixtures.myshopify.com")).toBeUndefined();
  });

  it("products/delete invalidates mappings versioned, not silently", async () => {
    const deps = await seededDeps();
    const job = await createShopifyJob(deps.store, TEST_STORE_ID, "intent_generation");
    await runIntentGenerationJob(deps, job);

    const scoped = deps.store.forMerchant(TEST_STORE_ID);
    const mappingsBefore = await scoped.listMappings();
    expect(mappingsBefore.length).toBeGreaterThan(0);
    const intentsBefore = await scoped.listIntents();

    const at = new Date().toISOString();
    expect(await scoped.markProductDeleted(DERIVED_PRODUCT_ID, at)).toBe(true);
    const touched = await scoped.invalidateProductMappings(DERIVED_PRODUCT_ID, at);
    expect(touched.length).toBeGreaterThan(0);

    // Mappings survive as invalidated rows — timestamps, no deletes.
    const mappingsAfter = await scoped.listMappings();
    expect(mappingsAfter.length).toBe(mappingsBefore.length);
    const deletedMappings = mappingsAfter.filter((m) => m.product_id === DERIVED_PRODUCT_ID);
    expect(deletedMappings.length).toBeGreaterThan(0);
    for (const mapping of deletedMappings) {
      expect(mapping.active).toBe(false);
      expect(mapping.invalidated_at).toBe(at);
    }

    // Intents citing the product's SKUs version-bump instead of vanishing.
    expect((await scoped.listIntents()).length).toBe(intentsBefore.length);
  });
});
