/**
 * Wire contract for the Pipeline v2 customer surfaces (apps/api/src/orchestration),
 * mirrored structurally from the route handlers so this package never imports
 * server code. Contract payloads (MarketingGraph, PromptRecord, MetricsSnapshot,
 * IntentRecordV2) are the core-schema types themselves; the Gate 3 lib preview
 * carries the intent-lib-export BuyerIntentLib type — the same record the
 * publisher persists.
 */

import type { BuyerStageV2, IntentCategoryV2, IntentRecordV2 } from "@intentvisible/core-schema";
import type {
  DemandTier,
  MarketingGraph,
  MetricsSnapshot,
  PromptRecord,
  RunDataMode,
} from "@intentvisible/core-schema";
import type { BuyerIntentLib } from "@intentvisible/intent-lib-export";

import { joinUrl } from "./client.js";
import { defaultFetch, jsonPostInit, requestJson, type FetchLike } from "./transport.js";

// ── Vocabularies (mirror apps/api/src/orchestration/types.ts) ───────────────

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

export const PIPELINE_TRIGGERS = ["shopify_app", "script_install", "site_url"] as const;
export type PipelineTrigger = (typeof PIPELINE_TRIGGERS)[number];

export const GATE_NUMBERS = [1, 2, 3] as const;
export type GateNumber = (typeof GATE_NUMBERS)[number];

export type GateConfig = Record<GateNumber, boolean>;

/** Human decisions; auto_approved is recorded by the API's timeout sweep only. */
export type GateReviewStatus = "pending" | "approved" | "rejected" | "auto_approved";
export type GateDecision = Exclude<GateReviewStatus, "pending" | "auto_approved">;

/** Per-project provider posture — "llm" is the lightweight default. */
export type ProjectDataMode = "llm" | "measured";

/** Monitoring cadence: monthly by default, weekly opt-in (unlocks 100-page crawl). */
export type MonitoringCadence = "weekly" | "monthly";

// ── Records ─────────────────────────────────────────────────────────────────

/** v2 pipeline project: the install + configuration root for one site. */
export interface PipelineProject {
  project_id: string;
  brand_id: string;
  brand_name: string;
  site_url: string;
  trigger: PipelineTrigger;
  country: string;
  language: string;
  gate_config: GateConfig;
  data_mode: ProjectDataMode;
  monthly_llm_request_cap: number | null;
  cadence: MonitoringCadence;
  created_at: string;
  updated_at: string;
}

/** One install-triggered pipeline run over a project. */
export interface PipelineRun {
  pipeline_id: string;
  project_id: string;
  status: PipelineStatus;
  status_history: Array<{ status: PipelineStatus; at: string }>;
  plan_id: string | null;
  trigger: PipelineTrigger;
  failure_reason: string | null;
  failure_detail: string | null;
  published: boolean;
  created_at: string;
  updated_at: string;
}

/** A pending or decided review task for one gate. */
export interface GateReview {
  review_id: string;
  project_id: string;
  pipeline_id: string;
  gate: GateNumber;
  status: GateReviewStatus;
  timeout_at: string;
  decided_at: string | null;
  note: string | null;
  created_at: string;
}

export interface MonitoringSchedule {
  schedule_id: string;
  project_id: string;
  plan_id: string;
  cadence: MonitoringCadence;
  status: "active" | "paused" | "cancelled";
  pause_reason: string | null;
  next_run_at: string;
  created_at: string;
  updated_at: string;
}

export interface DriftEvent {
  intent_id: string;
  from_visibility_pct: number;
  to_visibility_pct: number;
  delta_pct: number;
}

export interface MonitoringCycle {
  cycle_id: string;
  project_id: string;
  plan_id: string;
  status: "monitoring" | "computing" | "complete" | "failed";
  failure_reason: string | null;
  failure_detail: string | null;
  started_at: string;
  finished_at: string | null;
  drift_events: DriftEvent[];
  bumped_intents: Array<{ intent_id: string; from_version: number; to_version: number }>;
}

/** A published v2 intent record, scoped to its pipeline project. */
export interface PublishedIntent {
  project_id: string;
  record: IntentRecordV2;
}

/** GET /v2/projects/:id — the project page's single read. */
export interface ProjectBundle {
  project: PipelineProject;
  pipeline: PipelineRun | null;
  schedule: MonitoringSchedule | null;
  cycles: MonitoringCycle[];
  gates: GateReview[];
  published: PublishedIntent[];
}

/** POST /v2/projects — creation is accepted as async pipeline work (202). */
export interface PipelineProjectStart {
  project: PipelineProject;
  pipeline: PipelineRun;
}

// ── Request bodies ──────────────────────────────────────────────────────────

export interface CreatePipelineProjectRequest {
  site_url: string;
  brand_name?: string;
  trigger?: PipelineTrigger;
  country?: string;
  language?: string;
  data_mode?: ProjectDataMode;
  cadence?: MonitoringCadence;
  monthly_llm_request_cap?: number | null;
  /** Gate numbers to enable; absent = all gates off (the default). */
  gates?: GateNumber[];
}

export interface UpdatePipelineProjectRequest {
  site_url?: string;
  brand_name?: string;
  country?: string;
  language?: string;
  data_mode?: ProjectDataMode;
  cadence?: MonitoringCadence;
  monthly_llm_request_cap?: number | null;
  gates?: GateNumber[];
}

// ── Gate/dashboard read models ──────────────────────────────────────────────

/** A buyer stage × category pair label for prompts (the wire carries the enums). */
export type PromptBuyerStage = BuyerStageV2;
export type PromptIntentCategory = IntentCategoryV2;
export type PromptDemandTier = DemandTier;
export type PromptRunDataMode = RunDataMode;

export interface GraphResponse {
  /** Null until Stage A has produced the graph (Gate 1 render waits for it). */
  graph: MarketingGraph | null;
}

export interface PromptsResponse {
  prompts: PromptRecord[];
}

export interface MetricsResponse {
  /** Pooled snapshots: per-prompt entries carry prompt_id, per-intent omit it. */
  snapshots: MetricsSnapshot[];
}

export interface LibPreviewResponse {
  /** Null until a monitoring plan exists (Gate 3's pre-publish render). */
  lib: BuyerIntentLib | null;
}

export interface PublishedResponse {
  records: PublishedIntent[];
}

export interface PipelineClientOptions {
  /** IntentVisible deployment root, e.g. "https://iv.example.com". */
  baseUrl: string;
  /** Fetch implementation; defaults to globalThis.fetch. */
  fetchImpl?: FetchLike;
}

/**
 * Client for the Pipeline v2 customer surfaces: onboarding (create + install +
 * market edit), the three gate reviews, and the dashboard/lib reads. Every
 * method is a single HTTP call with no state; the API owns all transitions.
 */
export interface PipelineClient {
  /** Create the project and start the pipeline (site-URL fallback path). */
  createProject(request: CreatePipelineProjectRequest): Promise<PipelineProjectStart>;
  /** Start the pipeline from an install trigger (Shopify app or script ping). */
  startInstall(projectId: string, trigger: "shopify_app" | "script_install"): Promise<PipelineProjectStart>;
  /** Edit the project — a country/language change re-baselines (never mixes). */
  updateProject(projectId: string, patch: UpdatePipelineProjectRequest): Promise<PipelineProject>;
  /** The project page's single read: pipeline, schedule, cycles, gates, published. */
  getProject(projectId: string): Promise<ProjectBundle>;
  /** Record a human gate decision; the note is the feedback the rework path sees. */
  decideGate(reviewId: string, decision: GateDecision, note?: string): Promise<GateReview>;
  /** Gate 1 artifact: the marketing graph (null until Stage A produced one). */
  getGraph(projectId: string): Promise<GraphResponse>;
  /** Gate 2 artifact: the expanded prompts, drafts included. */
  listPrompts(projectId: string): Promise<PromptsResponse>;
  /** Dashboard data: pooled metrics snapshots with full provenance. */
  listMetrics(projectId: string): Promise<MetricsResponse>;
  /** Gate 3 artifact: the pre-publish lib render (null until a plan exists). */
  getLibPreview(projectId: string): Promise<LibPreviewResponse>;
  /** The lib browser's read: published Buyer Intent Lib records. */
  listPublished(projectId: string): Promise<PublishedResponse>;
}

function getInit(): RequestInit {
  return { method: "GET" };
}

function patchInit(patch: UpdatePipelineProjectRequest): RequestInit {
  return {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  };
}

export function createPipelineClient(options: PipelineClientOptions): PipelineClient {
  const { baseUrl } = options;
  const fetchImpl = options.fetchImpl ?? defaultFetch();
  const project = (projectId: string, path = ""): string =>
    joinUrl(baseUrl, `/v2/projects/${encodeURIComponent(projectId)}${path}`);

  return {
    createProject(request: CreatePipelineProjectRequest): Promise<PipelineProjectStart> {
      return requestJson<PipelineProjectStart>(
        fetchImpl,
        joinUrl(baseUrl, "/v2/projects"),
        jsonPostInit({}, request),
      );
    },

    startInstall(projectId, trigger) {
      return requestJson<PipelineProjectStart>(
        fetchImpl,
        project(projectId, `/install/${trigger === "shopify_app" ? "shopify" : "script"}`),
        jsonPostInit({}, {}),
      );
    },

    updateProject(projectId, patch) {
      return requestJson<PipelineProject>(fetchImpl, project(projectId), patchInit(patch));
    },

    getProject(projectId) {
      return requestJson<ProjectBundle>(fetchImpl, project(projectId), getInit());
    },

    decideGate(reviewId, decision, note) {
      return requestJson<GateReview>(
        fetchImpl,
        joinUrl(
          baseUrl,
          `/v2/gates/${encodeURIComponent(reviewId)}/${decision === "approved" ? "approve" : "reject"}`,
        ),
        jsonPostInit({}, { notes: note }),
      );
    },

    getGraph(projectId) {
      return requestJson<GraphResponse>(fetchImpl, project(projectId, "/graph"), getInit());
    },

    listPrompts(projectId) {
      return requestJson<PromptsResponse>(fetchImpl, project(projectId, "/prompts"), getInit());
    },

    listMetrics(projectId) {
      return requestJson<MetricsResponse>(fetchImpl, project(projectId, "/metrics"), getInit());
    },

    getLibPreview(projectId) {
      return requestJson<LibPreviewResponse>(fetchImpl, project(projectId, "/lib-preview"), getInit());
    },

    listPublished(projectId) {
      return requestJson<PublishedResponse>(fetchImpl, project(projectId, "/published"), getInit());
    },
  };
}
