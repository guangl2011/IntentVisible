/**
 * Wire contract for the Shopify merchant surfaces (apps/api/src/shopify),
 * mirrored structurally from the route handlers so this package never
 * imports server code. Contract payloads (ProductProfile, IntentRecord,
 * SkuIntentMapping) are the core-schema types themselves — the API serves
 * those validated records verbatim.
 */

import type {
  BuyerStage,
  IntentCategory,
  IntentRecord,
  ProductProfile,
  Scope,
  SkuIntentMapping,
} from "@intentvisible/core-schema";

import { joinUrl } from "./client.js";
import { defaultFetch, jsonPostInit, requestJson, type FetchLike } from "./transport.js";

// ── Job lifecycle (mirrors apps/api/src/shopify/jobs.ts) ────────────────────

export const SHOPIFY_JOB_KINDS = ["catalog_sync", "intent_generation"] as const;
export type ShopifyJobKind = (typeof SHOPIFY_JOB_KINDS)[number];

export const SHOPIFY_JOB_STATUSES = [
  "queued",
  "syncing",
  "generating",
  "validating",
  "complete",
  "failed",
] as const;
export type ShopifyJobStatus = (typeof SHOPIFY_JOB_STATUSES)[number];

/**
 * The closed failure vocabulary — a job never ends in a bare error. The
 * dashboard maps each reason to a recovery action (token_expired →
 * re-connect, no_snapshot → run a sync first).
 */
export const SHOPIFY_JOB_FAILURE_REASONS = [
  "token_expired",
  "graphql_error",
  "store_disconnected",
  "no_snapshot",
  "schema_validation_failed",
  "generation_empty",
  "no_evidence",
  "invalid_request",
  "not_found",
  "internal_error",
] as const;
export type ShopifyJobFailureReason = (typeof SHOPIFY_JOB_FAILURE_REASONS)[number];

export interface ShopifyJobError {
  reason: ShopifyJobFailureReason;
  detail: string;
}

export interface ShopifyJobStatusChange {
  status: ShopifyJobStatus;
  at: string;
}

export interface ShopifyJobResult {
  products_synced?: number;
  pages_stored?: number;
  per_product_failures?: number;
  brand_intents?: number;
  product_intents?: number;
  intents_created?: number;
  mappings_created?: number;
  library_intents?: number;
  library_mappings?: number;
}

export interface ShopifyJob {
  job_id: string;
  store_id: string;
  kind: ShopifyJobKind;
  status: ShopifyJobStatus;
  status_history: ShopifyJobStatusChange[];
  error: ShopifyJobError | null;
  result: ShopifyJobResult | null;
  created_at: string;
  updated_at: string;
}

/** Last job of one kind, as GET /v1/stores/:id summarizes it. */
export interface StoreJobSummary {
  job_id: string;
  kind: ShopifyJobKind;
  status: ShopifyJobStatus;
  created_at: string;
  updated_at: string;
  error: ShopifyJobError | null;
  result: ShopifyJobResult | null;
}

// ── Route bodies ────────────────────────────────────────────────────────────

/** POST /v1/install — begins the OAuth authorization-code grant. */
export interface InstallStart {
  store_id: string;
  install_url: string;
}

/** GET /v1/stores/:id — the overview's single read. */
export interface StoreStatus {
  store_id: string;
  shop_domain: string;
  connected: boolean;
  granted_scopes: string[];
  product_count: number;
  intent_count: number;
  mapping_count: number;
  last_sync: StoreJobSummary | null;
  last_generation: StoreJobSummary | null;
}

/** POST /v1/stores/:id/sync and /generate — 202 with the job to poll. */
export interface JobStart {
  job_id: string;
  status: ShopifyJobStatus;
}

/** A synced product: the catalog profile plus soft-delete state. */
export type ProductListItem = ProductProfile & { deleted_at: string | null };

/** A library mapping: the contract payload plus invalidation state. */
export type MappingListItem = SkuIntentMapping & {
  active: boolean;
  invalidated_at: string | null;
};

/** Read filters for the intent library view (spec D4 dashboard filtering). */
export interface IntentLibraryFilters {
  scope?: Scope;
  buyer_stage?: BuyerStage;
  intent_category?: IntentCategory;
  country?: string;
  language?: string;
}

export interface ProductList {
  store_id: string;
  products: ProductListItem[];
}

export interface IntentList {
  store_id: string;
  intents: IntentRecord[];
}

export interface MappingList {
  store_id: string;
  mappings: MappingListItem[];
}

/** Builds the query string for the intent filters; empty filters → "". */
export function intentFiltersQuery(filters: IntentLibraryFilters): string {
  const params = new URLSearchParams();
  if (filters.scope !== undefined) params.set("scope", filters.scope);
  if (filters.buyer_stage !== undefined) params.set("buyer_stage", filters.buyer_stage);
  if (filters.intent_category !== undefined) {
    params.set("intent_category", filters.intent_category);
  }
  if (filters.country !== undefined) params.set("country", filters.country);
  if (filters.language !== undefined) params.set("language", filters.language);
  const query = params.toString();
  return query === "" ? "" : `?${query}`;
}

/**
 * Client for the merchant surfaces: connect (install), catalog sync and
 * intent generation triggers, library reads, and job status. Every method
 * is a single HTTP call with no state — job progress is the caller's poll
 * of job() until the status is terminal.
 */
export interface ShopifyClient {
  /** Begin installing the app on a `{slug}.myshopify.com` store. */
  beginInstall(shop: string): Promise<InstallStart>;
  /** Connection state, last job of each kind, and library counts. */
  storeStatus(storeId: string): Promise<StoreStatus>;
  /** Enqueue a catalog sync; poll job() until complete/failed. */
  triggerSync(storeId: string): Promise<JobStart>;
  /** Enqueue intent generation; poll job() until complete/failed. */
  triggerGeneration(storeId: string): Promise<JobStart>;
  /** The synced catalog, deleted products included (soft deletes). */
  listProducts(storeId: string): Promise<ProductList>;
  /** The intent library, filtered per the D4 dashboard facets. */
  listIntents(storeId: string, filters?: IntentLibraryFilters): Promise<IntentList>;
  /** SKU ↔ intent mappings with landing URLs and evidence links. */
  listMappings(storeId: string): Promise<MappingList>;
  /** One job's lifecycle record — the poll target for sync/generate. */
  job(jobId: string): Promise<ShopifyJob>;
}

export interface ShopifyClientOptions {
  /** IntentVisible API root, e.g. "https://api.example.com" or "/shopify-api". */
  baseUrl: string;
  /** Fetch implementation; defaults to globalThis.fetch. */
  fetchImpl?: FetchLike;
}

export function createShopifyClient(options: ShopifyClientOptions): ShopifyClient {
  const { baseUrl, fetchImpl } = options;
  const fetch = fetchImpl ?? defaultFetch();
  const post = async (path: string, body: unknown): Promise<unknown> =>
    requestJson(fetch, joinUrl(baseUrl, path), jsonPostInit({}, body));

  return {
    async beginInstall(shop: string): Promise<InstallStart> {
      return (await post("/v1/install", { shop })) as InstallStart;
    },

    async storeStatus(storeId: string): Promise<StoreStatus> {
      return requestJson<StoreStatus>(
        fetch,
        joinUrl(baseUrl, `/v1/stores/${encodeURIComponent(storeId)}`),
        { method: "GET" },
      );
    },

    async triggerSync(storeId: string): Promise<JobStart> {
      return (await post(`/v1/stores/${encodeURIComponent(storeId)}/sync`, {})) as JobStart;
    },

    async triggerGeneration(storeId: string): Promise<JobStart> {
      return (await post(`/v1/stores/${encodeURIComponent(storeId)}/generate`, {})) as JobStart;
    },

    async listProducts(storeId: string): Promise<ProductList> {
      return requestJson<ProductList>(
        fetch,
        joinUrl(baseUrl, `/v1/stores/${encodeURIComponent(storeId)}/products`),
        { method: "GET" },
      );
    },

    async listIntents(storeId: string, filters: IntentLibraryFilters = {}): Promise<IntentList> {
      return requestJson<IntentList>(
        fetch,
        joinUrl(
          baseUrl,
          `/v1/stores/${encodeURIComponent(storeId)}/intents${intentFiltersQuery(filters)}`,
        ),
        { method: "GET" },
      );
    },

    async listMappings(storeId: string): Promise<MappingList> {
      return requestJson<MappingList>(
        fetch,
        joinUrl(baseUrl, `/v1/stores/${encodeURIComponent(storeId)}/mappings`),
        { method: "GET" },
      );
    },

    async job(jobId: string): Promise<ShopifyJob> {
      return requestJson<ShopifyJob>(
        fetch,
        joinUrl(baseUrl, `/v1/jobs/${encodeURIComponent(jobId)}`),
        { method: "GET" },
      );
    },
  };
}
