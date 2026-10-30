import Link from "next/link";

import type { ShopifyJobFailureReason, StoreJobSummary } from "@intentvisible/client";

import { failureCopy } from "../../../../lib/shopify/failure-copy";

/** Sub-navigation for the merchant pages; presentational only. */
export function ShopifyNav({ active }: { active: string }) {
  const items: Array<[string, string]> = [
    ["overview", "Overview"],
    ["catalog", "Catalog"],
    ["intents", "Intents"],
    ["mappings", "Mappings"],
  ];
  return (
    <div className="shopify-nav">
      {items.map(([key, label]) =>
        key === active ? (
          <span key={key} className="shopify-nav-active">
            {label}
          </span>
        ) : (
          <Link key={key} href={key === "overview" ? "/shopify" : `/shopify/${key}`}>
            {label}
          </Link>
        ),
      )}
    </div>
  );
}

/** Loading state: skeleton matching the card layout the data will fill. */
export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="card" aria-busy="true" aria-label={`Loading ${label}`}>
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line" />
      <div className="skeleton skeleton-line short" />
    </div>
  );
}

/** Error state for a failed data fetch. */
export function ErrorPanel({ message }: { message: string }) {
  return (
    <div className="card error-card" role="alert">
      <strong>Could not load data.</strong> {message}
    </div>
  );
}

/** Empty state: an explanation plus a call to action, never a blank area. */
export function EmptyPanel({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="card empty-card">
      <strong>{title}</strong>
      <p className="muted">{hint}</p>
    </div>
  );
}

/**
 * A terminal failed job: typed reason copy plus the recovery action the
 * merchant can take right here (re-connect or run a sync).
 */
export function FailurePanel({
  reason,
  detail,
  onReconnect,
  onSync,
}: {
  reason: ShopifyJobFailureReason;
  detail: string;
  onReconnect?: () => void;
  onSync?: () => void;
}) {
  const copy = failureCopy(reason);
  return (
    <div className="card failure-card" role="alert">
      <strong>{copy.title}</strong>
      <p className="muted">
        {copy.detail} <span className="failure-detail">{detail}</span>
      </p>
      {copy.recovery === "reconnect" && onReconnect !== undefined && (
        <button type="button" className="danger" onClick={onReconnect}>
          Re-connect store
        </button>
      )}
      {copy.recovery === "sync" && onSync !== undefined && (
        <button type="button" className="primary" onClick={onSync}>
          Run a sync
        </button>
      )}
      {copy.recovery === "retry" && (onSync !== undefined || onReconnect !== undefined) && (
        <p className="muted">Use the sync or reconnect action above to retry.</p>
      )}
    </div>
  );
}

function jobStateClass(status: StoreJobSummary["status"]): string {
  if (status === "complete") return "badge badge-APPROVED";
  if (status === "failed") return "badge badge-DENIED";
  return "badge badge-PENDING_APPROVAL";
}

/** One "last job" summary — the overview's sync/generate health lines. */
export function JobPanel({ label, job }: { label: string; job: StoreJobSummary | null }) {
  if (job === null) {
    return (
      <div className="card job-panel">
        <strong>{label}</strong>
        <p className="muted">Never run.</p>
      </div>
    );
  }
  const failed = job.status === "failed" && job.error !== null;
  return (
    <div className="card job-panel">
      <strong>{label}</strong>
      <p>
        <span className={jobStateClass(job.status)}>{job.status}</span>
      </p>
      {failed ? (
        <p className="muted">{failureCopy(job.error!.reason).title}: {job.error!.detail}</p>
      ) : (
        <JobResult job={job} />
      )}
    </div>
  );
}

function JobResult({ job }: { job: StoreJobSummary }) {
  const result = job.result;
  if (result === null) return null;
  if (job.kind === "catalog_sync") {
    return (
      <p className="muted">
        {result.products_synced ?? 0} products, {result.pages_stored ?? 0} pages
        {(result.per_product_failures ?? 0) > 0
          ? `, ${result.per_product_failures} products failed`
          : ""}
      </p>
    );
  }
  return (
    <p className="muted">
      {result.intents_created ?? 0} intents ({result.brand_intents ?? 0} brand,{" "}
      {result.product_intents ?? 0} product), {result.mappings_created ?? 0} mappings
    </p>
  );
}

/** The overview's count cards. */
export function StatCards({
  status,
}: {
  status: {
    connected: boolean;
    product_count: number;
    intent_count: number;
    mapping_count: number;
  };
}) {
  return (
    <div className="stat-grid">
      <div className="card stat">
        <span className="stat-value">
          {status.connected ? "Connected" : "Disconnected"}
        </span>
        <span className="muted">Connection</span>
      </div>
      <div className="card stat">
        <span className="stat-value">{status.product_count}</span>
        <span className="muted">Synced products</span>
      </div>
      <div className="card stat">
        <span className="stat-value">{status.intent_count}</span>
        <span className="muted">Library intents</span>
      </div>
      <div className="card stat">
        <span className="stat-value">{status.mapping_count}</span>
        <span className="muted">SKU mappings</span>
      </div>
    </div>
  );
}
