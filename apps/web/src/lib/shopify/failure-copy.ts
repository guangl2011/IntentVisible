import type { ShopifyJobFailureReason } from "@intentvisible/client";

/**
 * The typed job-failure vocabulary mapped to merchant-facing copy and the
 * recovery action the dashboard offers (spec D4: token_expired →
 * re-connect prompt, no_snapshot → run a sync first, …). An unknown
 * reason still renders — with the retry recovery, never a blank panel.
 */
export type FailureRecovery = "reconnect" | "sync" | "retry" | "none";

export interface FailureCopy {
  title: string;
  detail: string;
  recovery: FailureRecovery;
}

const COPY: Record<ShopifyJobFailureReason, FailureCopy> = {
  token_expired: {
    title: "Shopify access expired",
    detail: "The store’s Admin API token was revoked or expired. Reconnect the store to continue.",
    recovery: "reconnect",
  },
  store_disconnected: {
    title: "Store disconnected",
    detail: "This store is no longer connected to IntentVisible. Reconnect to continue.",
    recovery: "reconnect",
  },
  no_snapshot: {
    title: "Nothing synced yet",
    detail: "Run a catalog sync first — generation reads the synced catalog snapshots.",
    recovery: "sync",
  },
  schema_validation_failed: {
    title: "Synced data failed validation",
    detail: "The store returned data that failed the intent contract validation. Retry the sync.",
    recovery: "retry",
  },
  generation_empty: {
    title: "Nothing derivable found",
    detail:
      "The synced catalog carried no material the intent engine could derive intents from. Enrich product option names or descriptions and sync again.",
    recovery: "retry",
  },
  no_evidence: {
    title: "No evidence URLs",
    detail: "The store profile carries no valid evidence URLs, so nothing can be cited. Check the store’s domains.",
    recovery: "retry",
  },
  graphql_error: {
    title: "Shopify API error",
    detail: "The Shopify Admin API rejected the request. Retry — if it persists, check the store’s health.",
    recovery: "retry",
  },
  invalid_request: {
    title: "Invalid request",
    detail: "The request was malformed. Retry, and if it persists this is a bug worth reporting.",
    recovery: "retry",
  },
  not_found: {
    title: "Not found",
    detail: "The referenced store or job does not exist.",
    recovery: "none",
  },
  internal_error: {
    title: "Unexpected error",
    detail: "Something went wrong inside the Shopify API. Retry the job.",
    recovery: "retry",
  },
};

export function failureCopy(reason: ShopifyJobFailureReason): FailureCopy {
  return COPY[reason];
}
