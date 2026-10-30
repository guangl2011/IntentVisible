/**
 * Job lifecycle tests: the sync and generation state machines (including
 * typed failures) and determinism of generation ids. Everything runs on
 * the in-memory store, the in-process queue semantics, and the connector's
 * recorded Admin GraphQL fixtures.
 */

import { describe, expect, it } from "vitest";

import { runCatalogSyncJob, runIntentGenerationJob, createShopifyJob } from "./runner.js";
import {
  catalogResponses,
  makeDeps,
  routedGraphQLPost,
  seedMerchant,
  seededDeps,
  TEST_STORE_ID,
} from "./test-helpers.js";

describe("catalog sync job", () => {
  it("moves queued → syncing → validating → complete and persists the catalog", async () => {
    const deps = await makeDeps({ graphQLPost: routedGraphQLPost(catalogResponses()).post });
    await seedMerchant(deps.store);
    const job = await createShopifyJob(deps.store, TEST_STORE_ID, "catalog_sync");

    await runCatalogSyncJob(deps, job);

    const stored = await deps.store.getJob(job.job_id);
    expect(stored?.status).toBe("complete");
    expect(stored?.status_history.map((entry) => entry.status)).toEqual([
      "queued",
      "syncing",
      "validating",
      "complete",
    ]);
    expect(stored?.result).toMatchObject({
      products_synced: 3,
      per_product_failures: 0,
    });
    expect((stored?.result?.pages_stored ?? 0)).toBeGreaterThan(0);

    const scoped = deps.store.forMerchant(TEST_STORE_ID);
    expect((await scoped.listProducts()).length).toBe(3);
    expect(await scoped.getBrandProfile()).not.toBeNull();
  });

  it("fails typed token_expired when the Admin API rejects the token", async () => {
    const deps = await makeDeps({
      graphQLPost: routedGraphQLPost([
        { match: /./, status: 401, text: JSON.stringify({ errors: "Unauthorized" }) },
      ]).post,
    });
    await seedMerchant(deps.store);
    const job = await createShopifyJob(deps.store, TEST_STORE_ID, "catalog_sync");

    await runCatalogSyncJob(deps, job);

    const stored = await deps.store.getJob(job.job_id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error?.reason).toBe("token_expired");
  });

  it("fails typed store_disconnected when the merchant is disconnected", async () => {
    const deps = await makeDeps({ graphQLPost: routedGraphQLPost(catalogResponses()).post });
    await seedMerchant(deps.store, TEST_STORE_ID);
    // Disconnect: the merchant row flips without touching the token.
    const merchant = await deps.store.getMerchant(TEST_STORE_ID);
    await deps.store.upsertMerchant({
      ...(merchant as NonNullable<Awaited<ReturnType<typeof deps.store.getMerchant>>>),
      connected: false,
      updated_at: new Date().toISOString(),
    });
    const job = await createShopifyJob(deps.store, TEST_STORE_ID, "catalog_sync");

    await runCatalogSyncJob(deps, job);

    const stored = await deps.store.getJob(job.job_id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error?.reason).toBe("store_disconnected");
  });
});

describe("intent generation job", () => {
  it("generates from the latest snapshot and emits dedupe-stable ids", async () => {
    // Engine-derivable profiles (see seededDeps) — the connector's sync
    // fixtures carry no semantic material for the generator to derive.
    const deps = await seededDeps();
    const scoped = deps.store.forMerchant(TEST_STORE_ID);

    const first = await createShopifyJob(deps.store, TEST_STORE_ID, "intent_generation");
    await runIntentGenerationJob(deps, first);
    const firstJob = await deps.store.getJob(first.job_id);
    expect(firstJob?.status).toBe("complete");
    expect(firstJob?.status_history.map((entry) => entry.status)).toEqual([
      "queued",
      "generating",
      "validating",
      "complete",
    ]);
    expect(firstJob?.result?.intents_created).toBeGreaterThan(0);

    const idsAfterFirst = (await scoped.listIntents()).map((row) => row.intent_id).sort();

    // Second run over identical input: the id SET is identical — content
    // ids never re-mint, and the run completes (idempotent upserts).
    const second = await createShopifyJob(deps.store, TEST_STORE_ID, "intent_generation");
    await runIntentGenerationJob(deps, second);
    const secondJob = await deps.store.getJob(second.job_id);
    expect(secondJob?.status).toBe("complete");

    const idsAfterSecond = (await scoped.listIntents()).map((row) => row.intent_id).sort();
    expect(idsAfterFirst.length).toBeGreaterThan(0);
    expect(idsAfterSecond).toEqual(idsAfterFirst);

    // Two products deriving the same intent never double-mint an id.
    expect(new Set(idsAfterSecond).size).toBe(idsAfterSecond.length);
  });

  it("fails typed no_snapshot when the store has never synced", async () => {
    const deps = await makeDeps();
    await seedMerchant(deps.store);
    const job = await createShopifyJob(deps.store, TEST_STORE_ID, "intent_generation");

    await runIntentGenerationJob(deps, job);

    const stored = await deps.store.getJob(job.job_id);
    expect(stored?.status).toBe("failed");
    expect(stored?.error?.reason).toBe("no_snapshot");
  });
});
