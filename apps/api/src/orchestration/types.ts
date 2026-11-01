/**
 * Pipeline v2 orchestration records (blueprint art_9zAvKcEq, sections C.2–C.4
 * and the Iteration section). These are API-side pipeline records — the job
 * state machine (statuses, single-writer queue, typed failures) reuses the
 * v1 analyze machinery; this module defines the v2 record shapes, the status
 * vocabulary, and the legal transitions between them.
 *
 * Invariants that hold by construction:
 *   - every status transition is guarded by canTransition;
 *   - gate reviews exist only when the corresponding gate is enabled
 *     ("gates off create zero tasks");
 *   - a monitoring plan belongs to exactly one market (country + language) —
 *     a market change re-baselines, never mixes.
 */

import type { IntentRecordV2 } from "@intentvisible/core-schema";

/** Pipeline state machine, in run order (blueprint section 4). */
export const PIPELINE_STATUSES = [
  "installed",
  "crawling",
  "research",
  "modeling",
  "estimating",
  "pending_gate_1",
  "selecting",
  "expanding",
  "pending_gate_2",
  "monitoring",
  "computing",
  "pending_gate_3",
  "complete",
  "failed",
] as const;
export type PipelineStatus = (typeof PIPELINE_STATUSES)[number];

/** Legal status transitions. Gate statuses are skipped entirely when a gate is off. */
const LEGAL_TRANSITIONS: Readonly<Record<PipelineStatus, readonly PipelineStatus[]>> = {
  installed: ["crawling", "failed"],
  crawling: ["research", "failed"],
  research: ["modeling", "failed"],
  modeling: ["estimating", "failed"],
  estimating: ["pending_gate_1", "selecting", "failed"],
  pending_gate_1: ["crawling", "selecting", "failed"], // rejected → re-run Stage A; approved/gates-off → selecting
  selecting: ["expanding", "failed"],
  expanding: ["pending_gate_2", "monitoring", "failed"],
  pending_gate_2: ["selecting", "monitoring", "failed"], // rejected → re-run Stage B
  monitoring: ["computing", "failed"],
  computing: ["pending_gate_3", "complete", "failed"],
  pending_gate_3: ["complete", "failed"], // rejected → complete unpublished (rejection recorded)
  complete: [],
  failed: [],
};

/** True when a pipeline may move from one status to another in one step. */
export function canTransition(from: PipelineStatus, to: PipelineStatus): boolean {
  return LEGAL_TRANSITIONS[from].includes(to);
}

/** The three optional review gates, keyed by what they inspect. */
export const GATE_NUMBERS = [1, 2, 3] as const;
export type GateNumber = (typeof GATE_NUMBERS)[number];

export type GateDecision = "approved" | "rejected" | "auto_approved";

/** Per-project gate configuration (blueprint: gates are optional per project). */
export type GateConfig = Record<GateNumber, boolean>;

/** Gates are off by default — the pipeline never blocks unless asked to. */
export const DEFAULT_GATE_CONFIG: GateConfig = { 1: false, 2: false, 3: false };

/** Pipeline installation triggers (blueprint C.2). */
export const PIPELINE_TRIGGERS = ["shopify_app", "script_install", "site_url"] as const;
export type PipelineTrigger = (typeof PIPELINE_TRIGGERS)[number];

/** 72h gate timeout (blueprint C.2: "72h auto-proceed"). */
export const GATE_TIMEOUT_HOURS = 72;

/** v2 pipeline project: the install + configuration root for one site. */
export interface PipelineProjectRecord {
  project_id: string;
  brand_id: string;
  brand_name: string;
  site_url: string;
  trigger: PipelineTrigger;
  country: string;
  language: string;
  gate_config: GateConfig;
  /** Provider configuration surface — data_mode per project, default llm-only. */
  data_mode: "llm" | "measured";
  /** Monthly LLM request cap for monitoring (null = uncapped). */
  monthly_llm_request_cap: number | null;
  /** Recurring monitoring cadence — monthly default, weekly opt-in. */
  cadence: "weekly" | "monthly";
  created_at: string;
  updated_at: string;
}

/** One install-triggered pipeline run over a project. */
export interface PipelineRecord {
  pipeline_id: string;
  project_id: string;
  status: PipelineStatus;
  /** Every status the pipeline has been in, in order (re-baselines append). */
  status_history: Array<{ status: PipelineStatus; at: string }>;
  /** The monitoring plan this pipeline baselined (set once Stage B plans). */
  plan_id: string | null;
  /** What started this run (install hook, script ping, site URL, re-baseline). */
  trigger: PipelineTrigger;
  failure_reason: string | null;
  failure_detail: string | null;
  /** Set once the lib publish completed for this pipeline. */
  published: boolean;
  created_at: string;
  updated_at: string;
}

/** A pending or decided review task for one gate. */
export interface GateReviewRecord {
  review_id: string;
  project_id: string;
  pipeline_id: string;
  gate: GateNumber;
  status: "pending" | GateDecision;
  /** Absolute deadline; silence past it records auto_approved (72h default). */
  timeout_at: string;
  decided_at: string | null;
  note: string | null;
  created_at: string;
}

export type PipelineFailureReason =
  | "crawl_robots_blocked"
  | "crawl_unreachable"
  | "domain_violation"
  | "insufficient_evidence"
  | "llm_unavailable"
  | "llm_invalid_output"
  | "modeling_empty"
  | "spot_check_failed"
  | "estimation_failed"
  | "graph_invalid"
  | "selection_empty"
  | "no_scenarios"
  | "expansion_underflow"
  | "plan_invalid"
  | "data_mode_mismatch"
  | "usage_cap_reached"
  | "monitoring_failed"
  | "publish_failed"
  | "invalid_request"
  | "internal_error";

/** A scheduled recurring monitoring cadence for a project. */
export interface MonitoringScheduleRecord {
  schedule_id: string;
  project_id: string;
  plan_id: string;
  cadence: "weekly" | "monthly";
  status: "active" | "paused" | "cancelled";
  /** Why the schedule is paused (usage_cap_reached) — never silent. */
  pause_reason: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

/** One executed monitoring cycle (a recurring job, same state vocabulary). */
export interface MonitoringCycleRecord {
  cycle_id: string;
  project_id: string;
  plan_id: string;
  status: "monitoring" | "computing" | "complete" | "failed";
  failure_reason: string | null;
  failure_detail: string | null;
  started_at: string;
  finished_at: string | null;
  /** Intents whose pooled visibility dropped past the threshold this cycle. */
  drift_events: DriftEvent[];
  /** Version bumps the cycle applied: intent_id → new version. */
  bumped_intents: Array<{ intent_id: string; from_version: number; to_version: number }>;
}

/** Drift event: one intent whose pooled visibility moved beyond the threshold. */
export interface DriftEvent {
  intent_id: string;
  from_visibility_pct: number;
  to_visibility_pct: number;
  delta_pct: number;
}

/** >10 points of drift bumps the intent version (blueprint Iteration). */
export const DRIFT_THRESHOLD_PTS = 10;

/** A stored baseline: one plan's monitoring data, one market. */
export interface BaselineRecord {
  plan_id: string;
  project_id: string;
  graph_id: string;
  graph_version: number;
  country: string;
  language: string;
  data_mode: "llm_simulated" | "provider_measured";
  run_count: number;
  created_at: string;
}

/** The lib publish outcome (Stage C.3): the rendered lib + the flips. */
export interface LibPublishRecord {
  publish_id: string;
  project_id: string;
  plan_id: string;
  lib: unknown; // BuyerIntentLib (kept loose here; validated at build time)
  yaml_export: string;
  document_export: string;
  provenance: {
    source: string;
    model_id: string;
    date_range: { from: string; to: string };
    data_mode: "llm_simulated" | "provider_measured";
  };
  /** The intent records publish flipped: intent_id → old → new version. */
  flipped: Array<{ intent_id: string; from_version: number; to_version: number }>;
  published_at: string;
}

/** A published v2 intent record, scoped to its pipeline project. */
export interface PublishedIntentRecord {
  project_id: string;
  record: IntentRecordV2;
}

/** Customer-visible notification (usage caps, pause/resume, publish). */
export interface NotificationRecord {
  notification_id: string;
  project_id: string;
  kind: "usage_cap_reached" | "schedule_paused" | "schedule_resumed" | "lib_published";
  message: string;
  created_at: string;
}
