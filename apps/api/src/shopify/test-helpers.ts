/**
 * Shared fixtures for the Shopify surface tests. Tests run entirely on
 * real components (in-memory SQLite store, in-process queue, the real
 * connector) with two fakes: the Admin GraphQL transport (content-routed
 * recorded responses) and the OAuth token-exchange transport. No network,
 * no broker, no Postgres.
 */

import { createHash, createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import type { GraphQLPost } from "@intentvisible/shopify-connector";

import { InProcessQueue } from "../queue.js";
import { encryptToken } from "./secrets.js";
import { openShopifyDb, migrateShopifyDb } from "./db/client.js";
import { DrizzleShopifyStore, type MerchantRecord } from "./store.js";
import {
  createShopifyJob,
  runCatalogSyncJob,
  type ShopifyApiConfig,
  type ShopifyApiDeps,
} from "./runner.js";
import { BRAND, PRODUCT, SNAPSHOT } from "../../../../packages/intent-engine/tests/fixtures.js";

export const TEST_CLIENT_SECRET = "fixture_client_secret_do_not_ship";
export const TEST_SHOP_DOMAIN = "acme-fixtures.myshopify.com";
export const TEST_STORE_ID = "store_acme_fixtures";
/** Decrypted form of the token the install flow stores in tests. */
export const TEST_ACCESS_TOKEN = "shpat_fixture_token";

/**
 * The product the products/delete webhook tests target. The id follows the
 * webhook id-mapping (`product_<numeric>`) so a signed payload with the raw
 * numeric id routes to this row.
 */
export const DERIVED_PRODUCT_ID = "product_98765432100";
export const DERIVED_SKU_IDS = ["sku_111000111", "sku_111000222"] as const;

/** Deterministic 32-byte key so tokens encrypt/decrypt identically everywhere. */
export const TEST_TOKEN_KEY = createHash("sha256").update("shopify-test-token-key").digest();

export function testConfig(): ShopifyApiConfig {
  return {
    clientId: "client_fixture_123",
    clientSecret: TEST_CLIENT_SECRET,
    redirectUri: "https://app.intentvisible.test/v1/install/callback",
    apiVersion: "2026-10",
    tokenKey: TEST_TOKEN_KEY,
  };
}

/** A fresh, migrated in-memory store per test. */
export async function openTestStore(): Promise<DrizzleShopifyStore> {
  const db = openShopifyDb(":memory:");
  await migrateShopifyDb(db);
  return new DrizzleShopifyStore(db);
}

export async function makeDeps(overrides: Partial<ShopifyApiDeps> = {}): Promise<ShopifyApiDeps> {
  return {
    store: await openTestStore(),
    queue: new InProcessQueue(1),
    config: testConfig(),
    ...overrides,
  };
}

/** Seeds a connected merchant carrying the fixture access token. */
export async function seedMerchant(
  store: ShopifyApiDeps["store"],
  storeId = TEST_STORE_ID,
  shopDomain = TEST_SHOP_DOMAIN,
): Promise<void> {
  const now = new Date().toISOString();
  await store.upsertMerchant({
    id: storeId,
    shop_domain: shopDomain,
    connected: true,
    encrypted_access_token: encryptToken(TEST_ACCESS_TOKEN, TEST_TOKEN_KEY),
    granted_scopes: ["read_products", "read_online_store_pages"],
    brand_profile: null,
    created_at: now,
    updated_at: now,
  });
}

/** A connected merchant whose catalog sync ran on the connector's recorded fixtures. */
export async function syncedDeps(overrides: Partial<ShopifyApiDeps> = {}): Promise<ShopifyApiDeps> {
  const deps = await makeDeps({
    graphQLPost: routedGraphQLPost(catalogResponses()).post,
    ...overrides,
  });
  await seedMerchant(deps.store);
  await runCatalogSyncJob(
    deps,
    await createShopifyJob(deps.store, TEST_STORE_ID, "catalog_sync"),
  );
  return deps;
}

/**
 * A connected merchant whose catalog carries engine-derivable profiles.
 * The connector's sync fixtures only expose variant axes (Size, Fill
 * Weight) — real derivable material, which the deterministic generator
 * legitimately drops — so generation tests seed profiles of the same
 * shape the intent-engine's own tests prove derivable.
 */
export async function seededDeps(overrides: Partial<ShopifyApiDeps> = {}): Promise<ShopifyApiDeps> {
  const deps = await makeDeps(overrides);
  await seedMerchant(deps.store);
  const scoped = deps.store.forMerchant(TEST_STORE_ID);
  await scoped.saveCatalogPage(
    {
      contentHash: SNAPSHOT.content_hash,
      storageRef: SNAPSHOT.storage_ref,
      url: SNAPSHOT.url,
      fetchedAt: SNAPSHOT.fetched_at,
      raw: "<html>fixture catalog page</html>",
    },
    SNAPSHOT.fetched_at,
  );
  await scoped.saveBrandProfile({ ...BRAND, snapshot_refs: [SNAPSHOT] });
  await scoped.upsertProduct(
    {
      ...PRODUCT,
      product_id: DERIVED_PRODUCT_ID,
      skus: [
        { sku_id: DERIVED_SKU_IDS[0], name: "ExampleBrand 1000" },
        { sku_id: DERIVED_SKU_IDS[1], name: "ExampleBrand 1000 bundle" },
      ],
    },
    SNAPSHOT.fetched_at,
  );
  return deps;
}

function fixtureText(name: string): string {
  // The connector's recorded Admin responses are the shared contract
  // fixtures — reuse them rather than duplicating payload bytes.
  const path = `../../../../packages/shopify-connector/tests/fixtures/${name}`;
  return JSON.stringify(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8")));
}

export interface RoutedResponse {
  /** Regex tested against the GraphQL query text of each call. */
  match: RegExp;
  status?: number;
  text: string;
}

/**
 * Content-routed GraphQL fake: answers each call from the first unused
 * response whose regex matches the query text — order-agnostic, like the
 * real Admin API. An unmatched call fails loudly instead of hanging.
 */
export function routedGraphQLPost(responses: RoutedResponse[]): {
  post: GraphQLPost;
  queries: string[];
} {
  const used = new Set<number>();
  const queries: string[] = [];
  const post: GraphQLPost = async (_url, init) => {
    const body = JSON.parse(init.body) as { query?: string };
    queries.push(body.query ?? "");
    for (const [index, response] of responses.entries()) {
      if (!used.has(index) && response.match.test(body.query ?? "")) {
        used.add(index);
        return { status: response.status ?? 200, text: response.text, headers: {} };
      }
    }
    throw new Error(`unexpected GraphQL call: ${(body.query ?? "").slice(0, 120)}`);
  };
  return { post, queries };
}

/** The full fixture catalog: shop resource + two product pages + variant overflow. */
export function catalogResponses(): RoutedResponse[] {
  return [
    { match: /\bshop\s*\{/, text: fixtureText("shop-resource.json") },
    { match: /\bproducts\s*\(/, text: fixtureText("catalog-page-1.json") },
    { match: /\bproducts\s*\(/, text: fixtureText("catalog-page-2.json") },
    { match: /\bproduct\s*\(/, text: fixtureText("variant-overflow.json") },
  ];
}

/** Signs a raw body the way Shopify does (the documented HMAC algorithm). */
export function signWebhook(rawBody: string, secret = TEST_CLIENT_SECRET): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

/** Delivery headers for a signed webhook (lowercase, as Fastify presents them). */
export function webhookHeaders(
  rawBody: string,
  topic: string,
  webhookId: string,
  shop = TEST_SHOP_DOMAIN,
): Record<string, string> {
  return {
    "content-type": "application/json",
    "x-shopify-hmac-sha256": signWebhook(rawBody),
    "x-shopify-shop-domain": shop,
    "x-shopify-topic": topic,
    "x-shopify-webhook-id": webhookId,
  };
}

/** The token-exchange transport fake: always grants the fixture token. */
export function tokenExchangePostJson(token = "shpat_installed_in_test"): {
  status: number;
  text: string;
} {
  return {
    status: 200,
    text: JSON.stringify({ access_token: token, scope: "read_products,read_online_store_pages" }),
  };
}

export function merchantRecord(
  overrides: Partial<MerchantRecord> = {},
): MerchantRecord {
  const now = new Date().toISOString();
  return {
    id: TEST_STORE_ID,
    shop_domain: TEST_SHOP_DOMAIN,
    connected: true,
    encrypted_access_token: encryptToken(TEST_ACCESS_TOKEN, TEST_TOKEN_KEY),
    granted_scopes: ["read_products", "read_online_store_pages"],
    brand_profile: null,
    created_at: now,
    updated_at: now,
    ...overrides,
  };
}
