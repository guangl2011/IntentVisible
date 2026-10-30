/**
 * Real-dependency entrypoint: Gemini adapter from the injected runtime
 * secret, system clock, local snapshot storage, global fetch. Fixture
 * tests never run this module — they script the seams directly.
 *
 * The Shopify merchant surfaces compose into the same app when their
 * configuration is present (SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET +
 * INTENTVISIBLE_TOKEN_KEY + DATABASE_PATH); without them the API runs
 * the analyze surface only, unchanged.
 */

import { openSync, closeSync } from "node:fs";

import { FetchChatAdapter, resolveProviderConfig } from "@intentvisible/intent-engine";
import { LocalFileSnapshotStore, SystemClock } from "@intentvisible/url-extractor";

import { AnalyzePipeline } from "./pipeline.js";
import { InProcessQueue } from "./queue.js";
import { MemoryJobStore, MemoryLibraryStore } from "./store.js";
import { buildApp } from "./app.js";
import { openShopifyDb, migrateShopifyDb } from "./shopify/db/client.js";
import { DrizzleShopifyStore } from "./shopify/store.js";
import { registerShopifyRoutes } from "./shopify/routes.js";
import { decodeTokenKey } from "./shopify/secrets.js";
import type { ShopifyApiConfig, ShopifyApiDeps } from "./shopify/runner.js";

async function main(): Promise<void> {
  const model = process.env.LLM_MODEL;
  if (!model) {
    console.error("Set LLM_MODEL to the Gemini deployment to use.");
    process.exit(1);
  }
  const provider = resolveProviderConfig(process.env, model);
  if (!provider.ok) {
    console.error(`LLM provider unavailable: ${provider.reason}`);
    process.exit(1);
  }

  const snapshotRoot = process.env.SNAPSHOT_DIR ?? "/tmp/intentvisible-snapshots";
  const jobStore = new MemoryJobStore();
  const libraryStore = new MemoryLibraryStore();
  const queue = new InProcessQueue(1);
  const pipeline = new AnalyzePipeline({
    jobStore,
    libraryStore,
    queue,
    extractorDeps: {
      clock: new SystemClock(),
      fetchImpl: fetch,
      snapshotStore: new LocalFileSnapshotStore(snapshotRoot),
    },
    llmAdapter: new FetchChatAdapter({
      baseUrl: provider.config.baseUrl,
      apiKey: provider.config.apiKey,
      model: provider.config.model,
    }),
  });

  // ── Shopify surfaces (composed when fully configured) ──
  const shopifyDeps = await shopifyDepsFromEnv(queue);
  if (shopifyDeps === null) {
    console.log(
      "shopify surfaces disabled (set SHOPIFY_CLIENT_ID, SHOPIFY_CLIENT_SECRET, " +
        "INTENTVISIBLE_TOKEN_KEY, and DATABASE_PATH to enable)",
    );
  } else {
    console.log(`shopify surfaces enabled (Admin API ${shopifyDeps.config.apiVersion})`);
  }

  const app = buildApp({
    pipeline,
    jobStore,
    libraryStore,
    shopifyStore: shopifyDeps?.store,
  });
  if (shopifyDeps !== null) {
    registerShopifyRoutes(app, shopifyDeps);
  }

  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`intent-visible api listening on :${port}`);
}

/**
 * Builds the Shopify deps from the environment; null disables the
 * surfaces. DATABASE_PATH is a libsql URL — the file is created if
 * missing so first-run dev is `export` + start.
 */
async function shopifyDepsFromEnv(queue: InProcessQueue): Promise<ShopifyApiDeps | null> {
  const clientId = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;
  const tokenKey = process.env.INTENTVISIBLE_TOKEN_KEY;
  const dbPath = process.env.DATABASE_PATH;
  if (clientId === undefined || clientSecret === undefined || tokenKey === undefined) {
    return null;
  }
  if (dbPath === undefined) {
    console.error("SHOPIFY_* variables set but DATABASE_PATH is missing — shopify surfaces disabled.");
    return null;
  }

  const filePath = dbPath.startsWith("file:") ? dbPath.slice("file:".length) : null;
  if (filePath !== null) {
    // openShopifyDb requires an existing file for file: URLs — create it.
    closeSync(openSync(filePath, "a"));
  }
  const db = openShopifyDb(dbPath);
  await migrateShopifyDb(db);

  const config: ShopifyApiConfig = {
    clientId,
    clientSecret,
    redirectUri: process.env.SHOPIFY_REDIRECT_URI ?? "http://localhost:3000/v1/install/callback",
    apiVersion: process.env.SHOPIFY_API_VERSION ?? "2026-10",
    tokenKey: decodeTokenKey(tokenKey),
  };
  return { store: new DrizzleShopifyStore(db), queue, config };
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
