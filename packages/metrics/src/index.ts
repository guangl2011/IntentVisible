/**
 * Pure-function metric calculators over stored monitoring runs
 * (blueprint Stage C.2; Monitor Skill §4). No LLM, no network, no I/O:
 * raw answers are the immutable snapshots, metrics are derived from them
 * and always carry data_mode + provenance.
 */

export {
  MetricsError,
  MetricsInputError,
  MixedDataModeError,
  METRICS_ERROR_CODES,
  type MetricsErrorCode,
} from "./errors.js";
export {
  extractCitations,
  domainFromUrl,
  parseAnswer,
} from "./parse.js";
export { SENTIMENT_NEUTRAL, sentimentIndex, round2 } from "./sentiment.js";
export {
  VOID_OPPORTUNITY_THRESHOLD_PCT,
  citationShares,
  isHighDifferentiationOpportunity,
  leaderGap,
  visibilityPct,
  voidRatePct,
  type CitationShare,
  type LeaderGap,
} from "./formulas.js";
export { CONSENSUS_TOLERANCE_PTS, consensusFlag, type ConsensusFlag } from "./consensus.js";
export {
  computeMetrics,
  computePooledMetrics,
  type ComputeMetricsOptions,
  type MetricsSnapshot,
  type MonitoringRun,
} from "./compute.js";
export type { BrandAliasConfig, BrandId, ParsedAnswer, SentimentFact } from "./types.js";
