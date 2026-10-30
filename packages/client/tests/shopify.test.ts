import { describe, expect, it } from "vitest";

import { NotFoundError, createShopifyClient } from "../src/index.js";
import { stubFetch } from "./test-doubles.js";

const BASE = "https://iv.example.com";

function makeClient(responses: Array<{ status: number; body?: unknown }>) {
  const fetchImpl = stubFetch(responses);
  const client = createShopifyClient({ baseUrl: BASE, fetchImpl });
  return { client, fetchImpl };
}

describe("createShopifyClient", () => {
  it("posts the shop domain to /v1/install", async () => {
    const { client, fetchImpl } = makeClient([
      { status: 201, body: { store_id: "store_1", install_url: "https://shopify.com/oauth" } },
    ]);

    const result = await client.beginInstall("acme.myshopify.com");

    const call = fetchImpl.calls[0]!;
    expect(call.url).toBe(`${BASE}/v1/install`);
    expect(call.init.method).toBe("POST");
    expect(JSON.parse(String(call.init.body))).toEqual({ shop: "acme.myshopify.com" });
    expect(result).toEqual({ store_id: "store_1", install_url: "https://shopify.com/oauth" });
  });

  it("reads the store status with an encoded store id", async () => {
    const { client, fetchImpl } = makeClient([
      {
        status: 200,
        body: {
          store_id: "store/acme",
          shop_domain: "acme.myshopify.com",
          connected: true,
          granted_scopes: ["read_products"],
          product_count: 2,
          intent_count: 5,
          mapping_count: 7,
          last_sync: null,
          last_generation: null,
        },
      },
    ]);

    const status = await client.storeStatus("store/acme");

    expect(fetchImpl.calls[0]!.url).toBe(`${BASE}/v1/stores/store%2Facme`);
    expect(fetchImpl.calls[0]!.init.method).toBe("GET");
    expect(status.intent_count).toBe(5);
  });

  it("triggers sync and generate as 202 job starts", async () => {
    const { client, fetchImpl } = makeClient([
      { status: 202, body: { job_id: "job_1", status: "queued" } },
      { status: 202, body: { job_id: "job_2", status: "queued" } },
    ]);

    const sync = await client.triggerSync("store_1");
    const generate = await client.triggerGeneration("store_1");

    expect(fetchImpl.calls[0]!.url).toBe(`${BASE}/v1/stores/store_1/sync`);
    expect(fetchImpl.calls[1]!.url).toBe(`${BASE}/v1/stores/store_1/generate`);
    expect(sync).toEqual({ job_id: "job_1", status: "queued" });
    expect(generate).toEqual({ job_id: "job_2", status: "queued" });
  });

  it("builds the intent filter query string and omits empty filters", async () => {
    const { client, fetchImpl } = makeClient([
      { status: 200, body: { store_id: "s", intents: [] } },
      { status: 200, body: { store_id: "s", intents: [] } },
    ]);

    await client.listIntents("s");
    await client.listIntents("s", {
      scope: "product",
      intent_category: "Feature",
      country: "AU",
    });

    expect(fetchImpl.calls[0]!.url).toBe(`${BASE}/v1/stores/s/intents`);
    expect(fetchImpl.calls[1]!.url).toBe(
      `${BASE}/v1/stores/s/intents?scope=product&intent_category=Feature&country=AU`,
    );
  });

  it("reads products, mappings, and job status", async () => {
    const { client, fetchImpl } = makeClient([
      { status: 200, body: { store_id: "s", products: [] } },
      { status: 200, body: { store_id: "s", mappings: [] } },
      { status: 200, body: { job_id: "j", status: "complete", status_history: [], error: null, result: null } },
    ]);

    await client.listProducts("s");
    await client.listMappings("s");
    const job = await client.job("job x");

    expect(fetchImpl.calls[0]!.url).toBe(`${BASE}/v1/stores/s/products`);
    expect(fetchImpl.calls[1]!.url).toBe(`${BASE}/v1/stores/s/mappings`);
    expect(fetchImpl.calls[2]!.url).toBe(`${BASE}/v1/jobs/job%20x`);
    expect(job.status).toBe("complete");
  });

  it("maps an unknown store's 404 to NotFoundError", async () => {
    const { client } = makeClient([{ status: 404, body: { error: { reason: "not_found", detail: "unknown store id" } } }]);
    const error = await client.storeStatus("store_nope").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
  });
});
