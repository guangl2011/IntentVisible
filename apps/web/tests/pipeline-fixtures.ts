import {
  IntentRecordV2Schema,
  MarketingGraphSchema,
  MetricsSnapshotSchema,
  PromptRecordSchema,
} from "@intentvisible/core-schema";
import {
  exampleIntentRecordV2,
  exampleMarketingGraph,
  exampleMetricsSnapshot,
  examplePromptRecord,
  cloneFixture,
} from "@intentvisible/core-schema/testing-v2";
import { testLib } from "@intentvisible/intent-lib-export/testing";
import type {
  GateReview,
  PipelineProject,
  PipelineRun,
  PipelineStatus,
  ProjectBundle,
  PublishedIntent,
} from "@intentvisible/client";

/**
 * Pipeline v2 test fixtures on the recorded-fixture rule: the deep v2
 * records are the canonical core-schema fixtures parsed through their Zod
 * schemas (the same records the API route tests serve), the lib is the
 * intent-lib-export standard test world, and only the client-level wire
 * records (project, run, gate review) are hand-built here.
 */

export const METRICS_SNAPSHOT = MetricsSnapshotSchema.parse(exampleMetricsSnapshot);
export const MARKETING_GRAPH = MarketingGraphSchema.parse(exampleMarketingGraph);
export const PROMPT_RECORD = PromptRecordSchema.parse(examplePromptRecord);
export const INTENT_RECORD_V2 = IntentRecordV2Schema.parse(exampleIntentRecordV2);

/** A not_measured variant: no values, no provenance (the schema invariant). */
export const UNMEASURED_INTENT_RECORD_V2 = IntentRecordV2Schema.parse({
  ...cloneFixture(exampleIntentRecordV2),
  measurement_status: "not_measured",
  measurement_source: null,
  measurement_provenance: undefined,
  visibility_pct: null,
  monthly_search_volume: null,
});

export const BUYER_INTENT_LIB = testLib();

export const PIPELINE_PROJECT: PipelineProject = {
  project_id: "prj_pipeline_test",
  brand_id: "brand_solix",
  brand_name: "Solix Fixtures",
  site_url: "https://www.example.com",
  trigger: "site_url",
  country: "US",
  language: "en",
  gate_config: { 1: true, 2: true, 3: true },
  data_mode: "llm",
  monthly_llm_request_cap: null,
  cadence: "monthly",
  created_at: "2026-11-01T00:00:00Z",
  updated_at: "2026-11-01T00:00:00Z",
};

export function pipelineRun(status: PipelineStatus): PipelineRun {
  return {
    pipeline_id: "pl_pipeline_test",
    project_id: PIPELINE_PROJECT.project_id,
    status,
    status_history: [{ status, at: "2026-11-01T00:00:00Z" }],
    plan_id: null,
    trigger: "site_url",
    failure_reason: null,
    failure_detail: null,
    published: false,
    created_at: "2026-11-01T00:00:00Z",
    updated_at: "2026-11-01T00:00:00Z",
  };
}

export function gateReview(gate: 1 | 2 | 3, status: GateReview["status"]): GateReview {
  return {
    review_id: `rev_gate_${gate}_${status}`,
    project_id: PIPELINE_PROJECT.project_id,
    pipeline_id: "pl_pipeline_test",
    gate,
    status,
    timeout_at: "2026-11-04T00:00:00Z",
    decided_at: status === "pending" ? null : "2026-11-01T12:00:00Z",
    note: status === "rejected" ? "Swap the fridge prompt to the overnight scenario." : null,
    created_at: "2026-11-01T00:00:00Z",
  };
}

export const PROJECT_BUNDLE: ProjectBundle = {
  project: PIPELINE_PROJECT,
  pipeline: pipelineRun("pending_gate_1"),
  schedule: null,
  cycles: [],
  gates: [gateReview(1, "pending"), gateReview(2, "approved"), gateReview(3, "pending")],
  published: [],
};

export const PUBLISHED_INTENT: PublishedIntent = {
  project_id: PIPELINE_PROJECT.project_id,
  record: INTENT_RECORD_V2,
};
