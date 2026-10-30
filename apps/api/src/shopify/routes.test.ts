/**
 * Route contract tests: the HMAC-verified webhook intake (signed → queued,
 * mutated/missing header → 401 with zero DB writes), the install + callback
 * OAuth flow over the injected token-exchange transport, job enqueueing
 * (202 + poll), and the composed server's shared job route with the
 * Shopify fallback. All on the in-memory store and in-process queue.
 */

import { describe, expect, it } from "vitest";

import { signCallbackQuery } from "../../../../packages/shopify-connector/tests/helpers.js";
import { buildApp } from "../app.js";
import type { AnalyzePipeline } from "../pipeline.js";
import { buildShopifyApp } from "./routes.js";
import { runIntentGenerationJob, createShopifyJob } from "./runner.js";
import {
  catalogResponses,
  DERIVED_PRODUCT_ID,
  makeDeps,
  routedGraphQLPost,
  seedMerchant,
  seededDeps,
  TEST_SHOP_DOMAIN,
  TEST_STORE_ID,
  tokenExchangePostJson,
  webhookHeaders,
} from "./test-helpers.js";

describe("webhook intake", () => {
  it("a signed delivery reaches processing; a replay answers duplicate", async () => {
    const deps = await makeDeps();
    await seedMerchant(deps.store);
    const app = buildShopifyApp(deps);

    const raw = JSON.stringify({ id: 123456, domain: TEST_SHOP_DOMAIN });
    const first = await app.inject({
      method: "POST",
      url: "/v1/webhooks/shopify",
      payload: raw,
      headers: webhookHeaders(raw, "app/uninstalled", "delivery-1"),
    });
    expect(first.statusCode).toBe(202);
    await deps.queue.drain();

    const merchant = await deps.store.getMerchant(TEST_STORE_ID);
    expect(merchant?.connected).toBe(false);

    // The same delivery id again: replay protection, no reprocessing.
    const replay = await app.inject({
      method: "POST",
      url: "/v1/webhooks/shopify",
      payload: raw,
      headers: webhookHeaders(raw, "app/uninstalled", "delivery-1"),
    });
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ status: "duplicate" });
    expect((await deps.store.getMerchant(TEST_STORE_ID))?.connected).toBe(false);
  });

  it("a mutated body fails 401 typed and writes nothing", async () => {
    const deps = await makeDeps();
    const app = buildShopifyApp(deps);

    const raw = JSON.stringify({ id: 123456, domain: TEST_SHOP_DOMAIN });
    const headers = webhookHeaders(raw, "app/uninstalled", "delivery-2");
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/shopify",
      payload: JSON.stringify({ id: 999999, domain: "evil.example.com" }),
      headers,
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { reason: "hmac_rejected" } });

    // Zero DB writes: no merchant row for the (unknown) shop, and the
    // delivery id was not recorded — a later valid delivery processes fresh.
    expect(await deps.store.getMerchant(TEST_STORE_ID)).toBeNull();
    const later = await app.inject({
      method: "POST",
      url: "/v1/webhooks/shopify",
      payload: raw,
      headers,
    });
    expect(later.statusCode).toBe(202);
    expect(later.json()).not.toEqual({ status: "duplicate" });
  });

  it("a delivery with no HMAC header fails 401 before anything parses", async () => {
    const deps = await makeDeps();
    const app = buildShopifyApp(deps);

    const raw = JSON.stringify({ id: 1 });
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/shopify",
      payload: raw,
      headers: {
        "content-type": "application/json",
        "x-shopify-topic": "app/uninstalled",
        "x-shopify-shop-domain": TEST_SHOP_DOMAIN,
        "x-shopify-webhook-id": "delivery-3",
      },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ error: { reason: "hmac_rejected" } });
  });

  it("a signed products/delete soft-invalidates that product's mappings", async () => {
    // Engine-derivable profiles so generation produces mappings to invalidate.
    const deps = await seededDeps();
    await runIntentGenerationJob(
      deps,
      await createShopifyJob(deps.store, TEST_STORE_ID, "intent_generation"),
    );
    const app = buildShopifyApp(deps);

    const raw = JSON.stringify({
      id: 98765432100,
      admin_graphql_api_id: "gid://shopify/Product/98765432100",
    });
    const response = await app.inject({
      method: "POST",
      url: "/v1/webhooks/shopify",
      payload: raw,
      headers: webhookHeaders(raw, "products/delete", "delivery-4"),
    });
    expect(response.statusCode).toBe(202);
    await deps.queue.drain();

    const scoped = deps.store.forMerchant(TEST_STORE_ID);
    const products = await scoped.listProducts();
    expect(products.find((row) => row.product_id === DERIVED_PRODUCT_ID)?.deleted_at).not.toBeNull();

    const mappings = await scoped.listMappings();
    const invalidated = mappings.filter((m) => m.product_id === DERIVED_PRODUCT_ID);
    expect(invalidated.length).toBeGreaterThan(0);
    for (const mapping of invalidated) {
      expect(mapping.active).toBe(false);
      expect(mapping.invalidated_at).not.toBeNull();
    }
  });
});

describe("install flow", () => {
  it("install returns an authorization URL; callback exchanges and connects", async () => {
    const deps = await makeDeps({ postJson: async () => tokenExchangePostJson() });
    const app = buildShopifyApp(deps);

    const install = await app.inject({
      method: "POST",
      url: "/v1/install",
      payload: { shop: TEST_SHOP_DOMAIN },
    });
    expect(install.statusCode).toBe(201);
    const { store_id, install_url } = install.json() as { store_id: string; install_url: string };
    expect(store_id).toBe(TEST_STORE_ID);
    expect(install_url).toContain(`${TEST_SHOP_DOMAIN}/admin/oauth/authorize`);

    // The callback's query is signed per the docs algorithm; the state
    // nonce comes from the install URL.
    const state = new URL(install_url).searchParams.get("state") ?? "";
    const query: Record<string, string> = {
      code: "auth_code_1",
      host: "abc",
      shop: TEST_SHOP_DOMAIN,
      state,
      timestamp: "1735689600",
    };
    const callback = await app.inject({
      method: "GET",
      url: `/v1/install/callback?${new URLSearchParams({
        ...query,
        hmac: signCallbackQuery(query, deps.config.clientSecret),
      }).toString()}`,
    });
    expect(callback.statusCode).toBe(200);
    expect(callback.json()).toMatchObject({ store_id: TEST_STORE_ID, connected: true });

    const merchant = await deps.store.getMerchant(TEST_STORE_ID);
    expect(merchant?.connected).toBe(true);
    expect(merchant?.encrypted_access_token).not.toBeNull();

    // The nonce was consumed — a replayed callback fails 401.
    const replay = await app.inject({
      method: "GET",
      url: `/v1/install/callback?${new URLSearchParams({
        ...query,
        hmac: signCallbackQuery(query, deps.config.clientSecret),
      }).toString()}`,
    });
    expect(replay.statusCode).toBe(401);
  });

  it("install rejects non-myshopify domains with a typed 400", async () => {
    const deps = await makeDeps();
    const app = buildShopifyApp(deps);

    const response = await app.inject({
      method: "POST",
      url: "/v1/install",
      payload: { shop: "https://evil.example.com" },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ error: { reason: "invalid_request" } });
  });
});

describe("job routes", () => {
  it("sync returns 202 and the job completes through the in-process queue", async () => {
    const deps = await makeDeps({ graphQLPost: routedGraphQLPost(catalogResponses()).post });
    await seedMerchant(deps.store);
    const app = buildShopifyApp(deps);

    const enqueued = await app.inject({
      method: "POST",
      url: `/v1/stores/${TEST_STORE_ID}/sync`,
      payload: {},
    });
    expect(enqueued.statusCode).toBe(202);
    const { job_id } = enqueued.json() as { job_id: string };

    await deps.queue.drain();
    const job = await deps.store.getJob(job_id);
    expect(job?.status).toBe("complete");

    // The standalone job route serves the record.
    const fetched = await app.inject({ method: "GET", url: `/v1/jobs/${job_id}` });
    expect(fetched.statusCode).toBe(200);
    expect(fetched.json()).toMatchObject({ job_id, status: "complete" });
  });

  it("sync on an unknown store is a typed 404", async () => {
    const deps = await makeDeps();
    const app = buildShopifyApp(deps);

    const response = await app.inject({
      method: "POST",
      url: "/v1/stores/store_ghost/sync",
      payload: {},
    });
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { reason: "not_found" } });
  });

  it("generate produces a complete job and library reads serve intents", async () => {
    const deps = await seededDeps();
    const app = buildShopifyApp(deps);

    const generate = await app.inject({
      method: "POST",
      url: `/v1/stores/${TEST_STORE_ID}/generate`,
      payload: {},
    });
    expect(generate.statusCode).toBe(202);
    await deps.queue.drain();

    const intents = await app.inject({ method: "GET", url: `/v1/stores/${TEST_STORE_ID}/intents` });
    expect(intents.statusCode).toBe(200);
    expect((intents.json() as { intents: unknown[] }).intents.length).toBeGreaterThan(0);

    const mappings = await app.inject({ method: "GET", url: `/v1/stores/${TEST_STORE_ID}/mappings` });
    expect(mappings.statusCode).toBe(200);

    const products = await app.inject({ method: "GET", url: `/v1/stores/${TEST_STORE_ID}/products` });
    expect((products.json() as { products: unknown[] }).products).toHaveLength(1);
  });
});

describe("composed server", () => {
  it("the shared /v1/jobs route falls back to the shopify store", async () => {
    const deps = await makeDeps({ graphQLPost: routedGraphQLPost(catalogResponses()).post });
    await seedMerchant(deps.store);
    const job = await createShopifyJob(deps.store, TEST_STORE_ID, "catalog_sync");

    // The analyze pipeline is irrelevant to the jobs route; a minimal stub
    // keeps this test scoped to the fallback.
    const pipeline = {} as AnalyzePipeline;
    const app = buildApp({
      pipeline,
      jobStore: { getJob: async () => null } as never,
      libraryStore: {} as never,
      shopifyStore: deps.store,
    });

    const response = await app.inject({ method: "GET", url: `/v1/jobs/${job.job_id}` });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ job_id: job.job_id, status: "queued" });
  });
});
