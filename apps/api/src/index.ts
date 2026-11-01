/**
 * Minimal REST surface with async job queue: /v1/brands/analyze,
 * /v1/products/analyze, intent reads, /v1/jobs/{id} (spec art_KGYzMB5Z).
 */

export const API_PACKAGE_NAME = "@intentvisible/api";
export * from "./types.js";
export { InProcessQueue, type AnalyzeQueue } from "./queue.js";
export {
  MemoryJobStore,
  MemoryLibraryStore,
  type IntentFilters,
  type JobStore,
  type LibraryStore,
} from "./store.js";
export {
  DEFAULT_MARKETS,
  AnalyzePipeline,
  type PipelineDeps,
} from "./pipeline.js";
export { buildApp, type ApiDeps, type TypedErrorBody } from "./app.js";
export {
  PipelineOrchestrator,
  nextRunAt,
  ProjectValidationError,
  type CreateProjectInput,
  type OrchestratorDeps,
  type TickSummary,
  type UpdateProjectInput,
} from "./orchestration/pipeline.js";
export { MemoryPipelineStore, type PipelineStore } from "./orchestration/store.js";
export {
  registerOrchestrationRoutes,
  type OrchestrationDeps,
} from "./orchestration/routes.js";
export {
  GATE_TIMEOUT_HOURS,
  PIPELINE_STATUSES,
  canTransition,
  type DriftEvent,
  type GateConfig,
  type GateDecision,
  type GateNumber,
  type GateReviewRecord,
  type LibPublishRecord,
  type MonitoringCycleRecord,
  type MonitoringScheduleRecord,
  type PipelineFailureReason,
  type PipelineProjectRecord,
  type PipelineRecord,
  type PipelineStatus,
  type PipelineTrigger,
  type PublishedIntentRecord,
} from "./orchestration/types.js";
export { UsageCapExceeded } from "./orchestration/usage.js";
export { MixedDataModeError } from "@intentvisible/intent-lib-export";
