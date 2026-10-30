/**
 * URL extractor: robots-aware fetching, page snapshots, and structured
 * evidence-cited profile extraction (spec art_KGYzMB5Z, Flow Fetch/Extract).
 */

export { EXTRACTOR_PACKAGE_NAME } from "./package-name.js";
export { SystemClock, type Clock } from "./clock.js";
export {
  DomainRateLimiter,
} from "./rate-limit.js";
export { HttpRobotsGate, type RobotsDecision, type RobotsFile, type RobotsGate } from "./robots.js";
export {
  LocalFileSnapshotStore,
  type SnapshotStore,
} from "./snapshot.js";
export { extractLinks, urlKey } from "./links.js";
export { contentHash, hashHtml, normalizeHtml } from "./normalize.js";
export {
  DEFAULT_FETCHER_OPTIONS,
  UrlFetcher,
  type CrawlResult,
  type FetcherDeps,
  type FetcherOptions,
} from "./fetcher.js";
export {
  FETCH_FAILURE_REASONS,
  PIPELINE_FAILURE_REASONS,
  type FetchFailure,
  type FetchFailureReason,
  type FetchOutcome,
  type PageSnapshot,
  type PipelineFailureReason,
  type StoredSnapshot,
} from "./types.js";
