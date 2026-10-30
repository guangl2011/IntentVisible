/**
 * Store status read (GET /v1/stores/:id): the overview's single call —
 * connection state, last job of each kind, and library counts, all
 * merchant-scoped. Runs on the same fixture store as the surface tests;
 * jobs run through the real runner against the routed fixture transport.
 */

import { describe, expect, it } from "vitest";

import { createShopifyJob, runIntentGenerationJob } from "./runner.js";
import { buildShopifyApp } from "./routes.js";
import { TEST_SHOP_DOMAIN, TEST_STORE_ID, syncedDeps, makeDeps, seedMerchant } from "./test-helpers.js";

describe("GET /v1/stores/:id", () => {
  it("404s for an unknown store id", async () => {
    const app = buildShopifyApp(await makeDeps());
    const response = await app.inject({ method: "GET", url: "/v1/stores/store_nope" });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { reason: "not_found" } });
  });

  it("returns connection state and zero counts for a freshly seeded store", async () => {
    const deps = await makeDeps();
    await seedMerchant(deps.store);
    const app = buildShopifyApp(deps);
    const response = await app.inject({ method: "GET", url: `/v1/stores/${TEST_STORE_ID}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      store_id: TEST_STORE_ID,
      shop_domain: TEST_SHOP_DOMAIN,
      connected: true,
      granted_scopes: ["read_products", "read_online_store_pages"],
      product_count: 0,
      intent_count: 0,
      mapping_count: 0,
      last_sync: null,
      last_generation: null,
    });
  });

  it("surfaces the last job of each kind and library counts after sync + generation", async () => {
    // syncedDeps runs a real catalog_sync job through the fixture transport;
    // generation then runs directly over the seeded derivable profiles.
    const deps = await syncedDeps();
    const app = buildShopifyApp(deps);
    await runIntentGenerationJob(
      deps,
      await createShopifyJob(deps.store, TEST_STORE_ID, "intent_generation"),
    );

    const response = await app.inject({ method: "GET", url: `/v1/stores/${TEST_STORE_ID}` });
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      product_count: number;
      intent_count: number;
      mapping_count: number;
      last_sync: { status: string; kind: string } | null;
      last_generation: { status: string; kind: string; result: Record<string, unknown> | null } | null;
    };

    expect(body.last_sync).toMatchObject({ status: "complete", kind: "catalog_sync" });
    expect(body.last_generation).toMatchObject({ status: "complete", kind: "intent_generation" });
    expect(body.product_count).toBeGreaterThan(0);
    // The seeded profiles are engine-derivable — the library is populated
    // and the overview counts reflect what the dashboard will render.
    expect(body.intent_count).toBeGreaterThan(0);
    expect(body.mapping_count).toBeGreaterThan(0);
  });
});
