/**
 * Job state machine and typed failure vocabulary (spec art_KGYzMB5Z, API
 * table + Flow rows). Failure reasons are a closed vocabulary drawn from
 * the pipeline packages' own failure types — the API layer adds only
 * invalid_request and internal_error, so every error a client can see
 * traces back to a typed pipeline cause.
 */

import type { AnalyzeKind } from "@intentvisible/url-extractor";
import type { PipelineFailureReason } from "@intentvisible/url-extractor";
import type { GenerationFailureReason } from "@intentvisible/intent-engine";

/** queued → fetching → extracting → generating → validating → complete | failed */
export const JOB_STATUSES = [
  "queued",
  "fetching",
  "extracting",
  "generating",
  "validating",
  "complete",
  "failed",
] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_FAILURE_REASONS = [
  // Fetch-denied (Flow: robots-disallowed or unreachable → job failed, nothing generated).
  "fetch_robots_disallowed",
  "fetch_unreachable",
  // Extract-denied (Flow: the snapshot is kept for diagnosis).
  "extraction_empty",
  // Generate/validate-denied (intent-engine GenerationFailureReasons).
  "no_evidence",
  "llm_unavailable",
  "llm_invalid_output",
  "generation_empty",
  // API-layer only.
  "not_found",
  "invalid_request",
  "internal_error",
] as const;
export type JobFailureReason =
  | PipelineFailureReason
  | GenerationFailureReason
  | (typeof JOB_FAILURE_REASONS)[number];

/** Typed error payload on a failed job — machine-readable, detail is evidence. */
export interface JobError {
  reason: JobFailureReason;
  detail: string;
}

export interface JobStatusChange {
  status: JobStatus;
  at: string;
}

export interface JobResult {
  brand_id?: string;
  product_id?: string;
  intents_created: number;
}

export interface JobRecord {
  job_id: string;
  kind: AnalyzeKind;
  url: string;
  /** Optional brand link supplied on product analyze requests. */
  requested_brand_id?: string;
  /** Assigned the moment extraction registers the profile — before generation. */
  brand_id?: string;
  product_id?: string;
  status: JobStatus;
  status_history: JobStatusChange[];
  error: JobError | null;
  result: JobResult | null;
  created_at: string;
  updated_at: string;
}

/** Terminal-state guard: no transition may leave a terminal status. */
export function isTerminalStatus(status: JobStatus): boolean {
  return status === "complete" || status === "failed";
}
