/**
 * Shopify job execution (spec D2 job lifecycle): the state machine lives
 * here, the connectors and the generation seam do the work. A runner sees
 * a `ShopifyJobRun` handle — transition helpers and the merchant-scoped
 * store — and can neither skip the lifecycle nor fail untyped: every
 * escape maps onto the job's closed failure vocabulary before persisting.
 *
 * The queue seam is the analyze surface's InProcessQueue (no broker); the
 * enqueued closures here run sync/generation to completion.
 */

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { SystemClock, type Clock, type GenerationOutcome, type MarketTarget } from "@intentvisible/intent-engine";
import type { AnalyzeQueue } from "../queue.js";
import {
  DeterministicIntentGenerator,
  summaryOf,
} from "@intentvisible/intent-engine";
import {
  AdminGraphQLClient,
  isShopifyConnectorError,
  syncCatalog,
  type GraphQLPost,
  type PostJson,
  type ShopifyConnectorErrorCode,
} from "@intentvisible/shopify-connector";
import { decryptToken, SecretBoxError } from "./secrets.js";
import type {
  ShopifyJobFailureReason,
  ShopifyJobKind,
  ShopifyJobRecord,
  ShopifyJobResult,
  ShopifyJobStatus,
} from "./jobs.js";
import { failJob, transitionJob } from "./jobs.js";
import type {
  MerchantRecord,
  MerchantScopedStore,
  ShopifyStore,
} from "./store.js";

/** Markets the deterministic generator runs per job when none is passed. */
export const DEFAULT_GENERATION_MARKETS: readonly MarketTarget[] = [
  { country: "AU", language: "en" },
];

/** Runtime configuration for the Shopify surfaces (secrets stay in config). */
export interface ShopifyApiConfig {
  readonly clientId: string;
  readonly clientSecret: string;
  /** The app's registered OAuth callback URL (must match the dashboard). */
  readonly redirectUri: string;
  /** Pinned Admin API version, e.g. "2026-10". */
  readonly apiVersion: string;
  /** Raw-decoded 32-byte key for token encryption at rest. */
  readonly tokenKey: Buffer;
  /** Generation markets; DEFAULT_GENERATION_MARKETS when omitted. */
  readonly markets?: readonly MarketTarget[];
}

/** Injected edges for the Shopify routes and runners (tests use fixtures). */
export interface ShopifyApiDeps {
  readonly store: ShopifyStore;
  readonly config: ShopifyApiConfig;
  /** Job queue — every runner and webhook handler runs through it. */
  readonly queue: AnalyzeQueue;
  /** OAuth token-exchange transport (defaults to global fetch). */
  readonly postJson?: PostJson;
  /** Admin GraphQL transport (defaults to global fetch). */
  readonly graphQLPost?: GraphQLPost;
  /** Engine clock for generated_at stamps (defaults to SystemClock). */
  readonly clock?: Clock;
}

/** A runner's handle: one job, its merchant, and lifecycle helpers. */
export interface ShopifyJobRun {
  /**
   * The job's live state — beginStage/complete/fail advance it as the
   * runner progresses (kept in sync with the store on every transition).
   */
  job: ShopifyJobRecord;
  readonly merchant: MerchantRecord;
  readonly scoped: MerchantScopedStore;
  /** Moves the job into an open phase (syncing / generating / validating). */
  beginStage(status: Exclude<ShopifyJobStatus, "queued" | "complete" | "failed">): Promise<void>;
  complete(result: ShopifyJobResult): Promise<void>;
  fail(reason: ShopifyJobFailureReason, detail: string): Promise<void>;
}

/** Thrown by runners that know their typed failure reason directly. */
export class JobFailure extends Error {
  constructor(
    public readonly reason: ShopifyJobFailureReason,
    detail: string,
  ) {
    super(detail);
    this.name = "JobFailure";
  }
}

/** Creates the queued job record and persists it. */
export async function createShopifyJob(
  store: ShopifyStore,
  storeId: string,
  kind: ShopifyJobKind,
): Promise<ShopifyJobRecord> {
  const now = new Date().toISOString();
  const job: ShopifyJobRecord = {
    job_id: `job_${randomUUID()}`,
    store_id: storeId,
    kind,
    status: "queued",
    status_history: [{ status: "queued", at: now }],
    error: null,
    result: null,
    created_at: now,
    updated_at: now,
  };
  await store.saveJob(job);
  return job;
}

/**
 * Runs one job through its lifecycle. Store-disconnection is checked at
 * execution time (not enqueue time) so a disconnect between enqueue and
 * run surfaces as the typed store_disconnected failure, never a race.
 */
export async function executeShopifyJob(
  deps: { store: ShopifyStore },
  jobId: string,
  runner: (run: ShopifyJobRun) => Promise<void>,
): Promise<void> {
  const job = await deps.store.getJob(jobId);
  if (job === null) {
    throw new Error(`shopify job ${jobId} vanished before execution`);
  }
  const merchant = await deps.store.getMerchant(job.store_id);
  if (merchant === null || !merchant.connected) {
    const detail =
      merchant === null
        ? "merchant record no longer exists"
        : "store is disconnected — reinstall the app before this job can run";
    await deps.store.saveJob(failJob(job, "store_disconnected", detail));
    return;
  }

  const store = deps.store;
  const run: ShopifyJobRun = {
    job,
    merchant,
    scoped: store.forMerchant(merchant.id),
    async beginStage(status): Promise<void> {
      const next = transitionJob(run.job, status);
      run.job = next;
      await store.saveJob(next);
    },
    async complete(result): Promise<void> {
      const at = new Date().toISOString();
      const next: ShopifyJobRecord = {
        ...run.job,
        status: "complete",
        status_history: [...run.job.status_history, { status: "complete", at }],
        updated_at: at,
        result,
      };
      run.job = next;
      await store.saveJob(next);
    },
    async fail(reason, detail): Promise<void> {
      const next = failJob(run.job, reason, detail);
      run.job = next;
      await store.saveJob(next);
    },
  };

  try {
    await runner(run);
    // A runner that ends non-terminal is a bug — surface it as a typed
    // failure rather than leave the job open forever.
    if (run.job.status !== "complete" && run.job.status !== "failed") {
      await run.fail("internal_error", "job runner finished without completing the job");
    }
  } catch (error) {
    await run.fail(failureReasonFrom(error), error instanceof Error ? error.message : String(error));
  }
}

/** Maps any runner escape onto the job's closed failure vocabulary. */
function failureReasonFrom(error: unknown): ShopifyJobFailureReason {
  if (error instanceof JobFailure) {
    return error.reason;
  }
  if (error instanceof SecretBoxError) {
    return "token_expired";
  }
  if (error instanceof z.ZodError) {
    return "schema_validation_failed";
  }
  if (isShopifyConnectorError(error)) {
    return connectorReason(error.code);
  }
  return "internal_error";
}

function connectorReason(code: ShopifyConnectorErrorCode): ShopifyJobFailureReason {
  switch (code) {
    case "token_expired":
      return "token_expired";
    case "graphql_error":
      return "graphql_error";
    default:
      // hmac_rejected / state_mismatch / oauth_failed cannot occur inside
      // a sync or generation run (they are install/webhook flows) — map
      // them to internal_error rather than mislabel.
      return "internal_error";
  }
}

// ── catalog_sync ───────────────────────────────────────────────────────────

/**
 * queued → syncing (fetch + persist pages, brand, products) → validating
 * (re-read persisted rows through the schema-validating store) → complete.
 * Per-product sync failures are soft (the connector reports them) — the
 * job completes with the count; store-level failures map to typed reasons.
 */
export async function runCatalogSyncJob(
  deps: ShopifyApiDeps,
  job: ShopifyJobRecord,
): Promise<void> {
  await executeShopifyJob(deps, job.job_id, async (run) => {
    await run.beginStage("syncing");
    const client = adminClientFor(deps, run.merchant);
    const sync = await syncCatalog(client);

    let pagesStored = 0;
    for (const page of sync.pages) {
      const outcome = await run.scoped.saveCatalogPage(
        {
          contentHash: page.contentHash,
          storageRef: page.storageRef,
          url: page.url,
          fetchedAt: page.fetchedAt,
          raw: page.raw,
        },
        new Date().toISOString(),
      );
      if (outcome === "stored") {
        pagesStored += 1;
      }
    }
    await run.scoped.saveBrandProfile(sync.brand);
    for (const product of sync.products) {
      await run.scoped.upsertProduct(product, new Date().toISOString());
    }

    await run.beginStage("validating");
    await validatePersisted(run);

    await run.complete({
      products_synced: sync.products.length,
      pages_stored: pagesStored,
      per_product_failures: sync.failures.length,
    });
  });
}

// ── intent_generation ──────────────────────────────────────────────────────

/**
 * queued → generating (deterministic generator over the latest snapshot
 * batch) → validating → complete. Existing summaries thread into each
 * generation call — across brand/products AND accumulated within the run —
 * so two runs over identical input emit identical id sets, and two
 * products deriving the same intent never double-mint an id.
 */
export async function runIntentGenerationJob(
  deps: ShopifyApiDeps,
  job: ShopifyJobRecord,
): Promise<void> {
  await executeShopifyJob(deps, job.job_id, async (run) => {
    await run.beginStage("generating");

    const snapshots = await run.scoped.latestSnapshotRefs();
    if (snapshots.length === 0) {
      throw new JobFailure("no_snapshot", "no synced catalog snapshots — run a sync first");
    }
    const brand = await run.scoped.getBrandProfile();
    if (brand === null) {
      throw new JobFailure(
        "no_snapshot",
        "synced snapshots have no derived brand profile — run a catalog sync first",
      );
    }

    const generator = new DeterministicIntentGenerator({
      clock: deps.clock ?? new SystemClock(),
    });
    const markets = deps.config.markets ?? DEFAULT_GENERATION_MARKETS;
    // Dedup baseline: the store's library, extended in-run so later
    // generations see earlier outcomes of the same job.
    const existing = [...(await run.scoped.intentSummaries())];

    const brandOutcome = await generator.generateBrandIntents(brand, {
      markets,
      snapshots,
      existing,
    });
    // An empty brand profile is a valid empty result, not a failure: the
    // connector-saved brand (Admin shop resource) carries no category or
    // use-case material today, and product profiles can still be derivable.
    // The job-level vocabulary is preserved below — a job where nothing at
    // all was derivable still fails as generation_empty.
    if (!brandOutcome.ok && brandOutcome.reason !== "generation_empty") {
      throw generationFailure(brandOutcome);
    }
    const brandRecords = brandOutcome.ok ? brandOutcome.records : [];
    await run.scoped.saveIntents(brandRecords);
    existing.push(...brandRecords.map(summaryOf));

    const liveProducts = (await run.scoped.listProducts()).filter(
      (row) => row.deleted_at === null,
    );
    let productIntents = 0;
    let mappingsCreated = 0;
    for (const product of liveProducts) {
      const outcome = await generator.generateProductIntents(product.payload, {
        markets,
        snapshots,
        existing,
      });
      // Same shape as the brand stage: one thin product must not fail the
      // whole job — only a truly undeliverable reason does.
      if (!outcome.ok && outcome.reason !== "generation_empty") {
        throw generationFailure(outcome);
      }
      const records = outcome.ok ? outcome.records : [];
      const mappings = outcome.ok ? outcome.mappings : [];
      await run.scoped.saveIntents(records);
      await run.scoped.saveMappings(mappings);
      existing.push(...records.map(summaryOf));
      productIntents += records.length;
      mappingsCreated += mappings.length;
    }

    if (brandRecords.length + productIntents === 0) {
      throw new JobFailure(
        "generation_empty",
        "no brand or product profile carried derivable material",
      );
    }

    await run.beginStage("validating");
    // Readback re-parses every stored record through core-schema (the
    // store validates on read); a ZodError here maps to
    // schema_validation_failed.
    const storedIntents = await run.scoped.listIntents();
    const storedMappings = await run.scoped.listMappings();

    await run.complete({
      brand_intents: brandRecords.length,
      product_intents: productIntents,
      intents_created: brandRecords.length + productIntents,
      mappings_created: mappingsCreated,
      library_intents: storedIntents.length,
      library_mappings: storedMappings.length,
    });
  });
}

// ── helpers ────────────────────────────────────────────────────────────────

/**
 * The deterministic seam only emits no_evidence / generation_empty; the
 * llm_* reasons would mean the seam is misconfigured — fail as
 * internal_error with the engine's detail rather than mislabel the job.
 */
function generationFailure(
  outcome: Extract<GenerationOutcome, { ok: false }>,
): JobFailure {
  if (outcome.reason === "llm_unavailable" || outcome.reason === "llm_invalid_output") {
    return new JobFailure(
      "internal_error",
      `deterministic generator reported ${outcome.reason}: ${outcome.detail}`,
    );
  }
  return new JobFailure(outcome.reason, outcome.detail);
}

/** Builds the Admin client for a merchant, decrypting the stored token. */
function adminClientFor(deps: ShopifyApiDeps, merchant: MerchantRecord): AdminGraphQLClient {
  if (merchant.encrypted_access_token === null) {
    throw new JobFailure("token_expired", "store carries no stored access token");
  }
  const accessToken = decryptToken(merchant.encrypted_access_token, deps.config.tokenKey);
  return new AdminGraphQLClient(
    {
      storeId: merchant.id,
      shopDomain: merchant.shop_domain,
      accessToken,
      apiVersion: deps.config.apiVersion,
    },
    { post: deps.graphQLPost },
  );
}

/**
 * The sync job's validating stage: re-reads what was persisted through the
 * schema-validating store. Every read parses payloads via core-schema, so
 * a contract violation or a corrupted row fails the job as
 * schema_validation_failed instead of surfacing bad data later.
 */
async function validatePersisted(run: ShopifyJobRun): Promise<void> {
  const refs = await run.scoped.latestSnapshotRefs();
  const brand = await run.scoped.getBrandProfile();
  if (refs.length === 0 || brand === null) {
    throw new JobFailure(
      "schema_validation_failed",
      "sync completed but the persisted snapshots or brand profile are missing",
    );
  }
  const products = await run.scoped.listProducts();
  if (products.length === 0) {
    throw new JobFailure(
      "schema_validation_failed",
      "sync completed but no products were persisted",
    );
  }
}
