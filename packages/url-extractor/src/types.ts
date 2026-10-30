import type { z } from "zod";
import type { SnapshotRefSchema } from "@intentvisible/core-schema";

/**
 * Shared fetch-layer types: snapshots, typed failures, and the injectable
 * fetch signature. Failures are values, not exceptions, so the API layer
 * can map them straight onto job state machine reasons (spec Flow table).
 */

/** Fetch is injectable for tests; the real driver is the global fetch. */
export type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export const FETCH_FAILURE_REASONS = ["fetch_robots_disallowed", "fetch_unreachable"] as const;
export type FetchFailureReason = (typeof FETCH_FAILURE_REASONS)[number];

/**
 * Typed fetch failure. `detail` carries the diagnosis (HTTP status, robots
 * rule, network message); it is never user-facing prose, it is evidence.
 */
export interface FetchFailure {
  reason: FetchFailureReason;
  url: string;
  detail: string;
}

/** Result of fetching exactly one page. */
export type FetchOutcome =
  | { ok: true; snapshot: PageSnapshot }
  | { ok: false; failure: FetchFailure };

/** In-memory fetch result, pre-persistence. */
export interface PageSnapshot {
  /** Final URL after redirects — the evidence URL downstream records cite. */
  url: string;
  status: number;
  fetched_at: string;
  content_hash: string;
  raw_html: string;
}

/** Persisted snapshot reference — structurally the core-schema SnapshotRef. */
export type StoredSnapshot = z.output<typeof SnapshotRefSchema>;

/** All failures this package's pipeline can produce (fetch + extraction). */
export const PIPELINE_FAILURE_REASONS = [
  "fetch_robots_disallowed",
  "fetch_unreachable",
  "extraction_empty",
] as const;
export type PipelineFailureReason = (typeof PIPELINE_FAILURE_REASONS)[number];
