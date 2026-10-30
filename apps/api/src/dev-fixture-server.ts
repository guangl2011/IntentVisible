/**
 * Dev fixture entrypoint: the full composed API (analyze + Shopify
 * merchant surfaces) backed entirely by fixture data — a pre-connected
 * merchant, a repeating routed Admin GraphQL fake carrying derivable
 * catalog material, in-memory SQLite. No Shopify credentials, no
 * outbound network, no LLM calls (the analyze surface is unused by the
 * merchant dashboard dogfood).
 *
 * Start: pnpm --filter @intentvisible/api dev:fixtures  (PORT defaults
 * to 4310). The seeded store id is store_acme_fixtures.
 */

import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { FetchChatAdapter } from "@intentvisible/intent-engine";
import { LocalFileSnapshotStore, SystemClock } from "@intentvisible/url-extractor";

import { AnalyzePipeline } from "./pipeline.js";
import { MemoryJobStore, MemoryLibraryStore } from "./store.js";
import { buildApp } from "./app.js";
import { registerShopifyRoutes } from "./shopify/routes.js";
import {
  TEST_ACCESS_TOKEN,
  TEST_CLIENT_SECRET,
  TEST_SHOP_DOMAIN,
  TEST_STORE_ID,
  makeDeps,
  routedGraphQLPost,
  seedMerchant,
  type RoutedResponse,
} from "./shopify/test-helpers.js";

/** A shop resource whose description carries derivable brand material. */
const shopFixture: RoutedResponse = {
  match: /\bshop\s*\{/,
  text: JSON.stringify({
    data: {
      shop: {
        name: "Acme Fixtures Outfitters",
        description:
          "Portable LiFePO4 power stations and merino camp goods for overlanders and cold-weather campers",
        currencyCode: "USD",
        myshopifyDomain: TEST_SHOP_DOMAIN,
        url: "https://acme-fixtures.myshopify.com",
        primaryDomain: {
          host: "www.acme-fixtures-outfitters.com",
          url: "https://www.acme-fixtures-outfitters.com",
        },
      },
    },
  }),
};

/** One catalog page whose option names and prices are engine-derivable. */
const catalogPageFixture: RoutedResponse = {
  match: /\bproducts\s*\(/,
  text: JSON.stringify({
    data: {
      products: {
        nodes: [
          {
            id: "gid://shopify/Product/98765432100",
            legacyResourceId: "98765432100",
            title: "SunBeam 1000 Portable Power Station",
            handle: "sunbeam-1000-portable-power-station",
            description:
              "A 993Wh LiFePO4 portable power station with a 1000W pure sine AC inverter and MPPT solar input.",
            onlineStoreUrl:
              "https://www.acme-fixtures-outfitters.com/products/sunbeam-1000-portable-power-station",
            onlineStorePreviewUrl:
              "https://preview.acme-fixtures-outfitters.com/products/sunbeam-1000-portable-power-station",
            options: [
              { name: "993Wh LiFePO4 battery capacity" },
              { name: "1000W pure sine AC inverter" },
            ],
            variants: {
              nodes: [
                {
                  id: "gid://shopify/ProductVariant/111000111",
                  legacyResourceId: "111000111",
                  title: "Standard",
                  price: { amount: "999.00", currencyCode: "USD" },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
          {
            id: "gid://shopify/Product/98765432101",
            legacyResourceId: "98765432101",
            title: "Merino Camp Blanket",
            handle: "merino-camp-blanket",
            description:
              "A lightweight merino wool camp blanket rated for cold nights in the field.",
            onlineStoreUrl:
              "https://www.acme-fixtures-outfitters.com/products/merino-camp-blanket",
            onlineStorePreviewUrl:
              "https://preview.acme-fixtures-outfitters.com/products/merino-camp-blanket",
            options: [{ name: "Lightweight merino wool for cold nights" }],
            variants: {
              nodes: [
                {
                  id: "gid://shopify/ProductVariant/222000111",
                  legacyResourceId: "222000111",
                  title: "One size",
                  price: { amount: "89.99", currencyCode: "USD" },
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        ],
        pageInfo: { hasNextPage: false, endCursor: null },
      },
    },
  }),
};

async function main(): Promise<void> {
  const deps = await makeDeps({
    graphQLPost: routedGraphQLPost([shopFixture, catalogPageFixture]).post,
  });
  await seedMerchant(deps.store);

  // The analyze surface is not part of the merchant dogfood; a dummy
  // adapter keeps it constructible without any provider credentials.
  const jobStore = new MemoryJobStore();
  const libraryStore = new MemoryLibraryStore();
  const pipeline = new AnalyzePipeline({
    jobStore,
    libraryStore,
    queue: deps.queue,
    extractorDeps: {
      clock: new SystemClock(),
      fetchImpl: fetch,
      snapshotStore: new LocalFileSnapshotStore(
        mkdtempSync(join(tmpdir(), "iv-fixture-snapshots-")),
      ),
    },
    llmAdapter: new FetchChatAdapter({
      baseUrl: "http://127.0.0.1:9/not-a-provider",
      apiKey: "fixture-not-used",
      model: "fixture-not-used",
    }),
  });

  const app = buildApp({
    pipeline,
    jobStore,
    libraryStore,
    shopifyStore: deps.store,
  });
  registerShopifyRoutes(app, deps);

  const port = Number(process.env.PORT ?? 4310);
  await app.listen({ port, host: "127.0.0.1" });
  console.log(`intent-visible fixture api listening on :${port}`);
  console.log(`  store id:     ${TEST_STORE_ID} (${TEST_SHOP_DOMAIN})`);
  console.log(`  access token: ${TEST_ACCESS_TOKEN} / client secret: ${TEST_CLIENT_SECRET} (fixtures only)`);
  console.log("  catalog fake: 2 derivable products; sync/generate jobs run in-process.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
