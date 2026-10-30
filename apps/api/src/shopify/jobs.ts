/**
 * Shopify job state machine (spec D2 job lifecycle table). Two kinds run in
 * this slice, each with its own open-path statuses and one closed failure
 * vocabulary — a job never ends in a bare error:
 *
 *   catalog_sync      queued → syncing → validating → complete | failed
 *                     (token_expired, graphql_error, store_disconnected)
 *   intent_generation queued → generating → validating → complete | failed
 *                     (no_snapshot, schema_validation_failed,
 *                      store_disconnected)
 *
 * `generation_empty`/`no_evidence` are additive engine passthroughs (the
 * deterministic generator's own typed reasons; `no_evidence` is guarded
 * unreachable by the no-snapshot pre-check but kept so a connector change
 * cannot produce an untyped failure). invalid_request/not_found/
 * internal_error are the API-layer additions, mirroring the analyze
 * surface's vocabulary in ../types.ts.
 */

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

export const SHOPIFY_JOB_FAILURE_REASONS = [
  // Sync-denied.
  "token_expired",
  "graphql_error",
  "store_disconnected",
  // Generate-denied.
  "no_snapshot",
  "schema_validation_failed",
  // Engine passthrough (deterministic generator).
  "generation_empty",
  "no_evidence",
  // API-layer only.
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
  /** Readback counts after the validating stage (generation jobs). */
  library_intents?: number;
  library_mappings?: number;
}

export interface ShopifyJobRecord {
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

/** The coarse machine the engine spec's route contract names. */
export type ShopifyJobState = "queued" | "running" | "complete" | "failed";

/** queued | running (any open phase) | complete | failed. */
export function coarseJobState(status: ShopifyJobStatus): ShopifyJobState {
  switch (status) {
    case "queued":
      return "queued";
    case "complete":
      return "complete";
    case "failed":
      return "failed";
    default:
      return "running";
  }
}

function isTerminal(status: ShopifyJobStatus): boolean {
  return status === "complete" || status === "failed";
}

/** The one valid successor path per kind. */
function expectedNext(kind: ShopifyJobKind, current: ShopifyJobStatus): ShopifyJobStatus[] {
  if (current === "failed") return [];
  if (current === "complete") return [];
  if (current === "queued") return [kind === "catalog_sync" ? "syncing" : "generating", "failed"];
  if (current === "syncing" || current === "generating") return ["validating", "failed"];
  if (current === "validating") return ["complete", "failed"];
  return [];
}

/**
 * Applies a status transition, enforcing the kind's machine. A violation
 * throws — the callers' happy paths encode the table above; a wrong move
 * is a bug and must surface, not silently corrupt the history.
 */
export function transitionJob(job: ShopifyJobRecord, next: ShopifyJobStatus): ShopifyJobRecord {
  if (isTerminal(job.status)) {
    throw new Error(`job ${job.job_id} is terminal (${job.status}); cannot move to ${next}`);
  }
  if (!expectedNext(job.kind, job.status).includes(next)) {
    throw new Error(
      `illegal ${job.kind} transition ${job.status} → ${next} (spec D2 job lifecycle table)`,
    );
  }
  const at = new Date().toISOString();
  return {
    ...job,
    status: next,
    status_history: [...job.status_history, { status: next, at }],
    updated_at: at,
  };
}

/** Marks a job failed with its typed reason (valid from any open status). */
export function failJob(
  job: ShopifyJobRecord,
  reason: ShopifyJobFailureReason,
  detail: string,
): ShopifyJobRecord {
  if (isTerminal(job.status)) {
    throw new Error(`job ${job.job_id} is terminal (${job.status}); cannot fail from it`);
  }
  const at = new Date().toISOString();
  return {
    ...job,
    status: "failed",
    status_history: [...job.status_history, { status: "failed", at }],
    updated_at: at,
    error: { reason, detail },
  };
}
