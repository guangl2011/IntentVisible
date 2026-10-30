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
