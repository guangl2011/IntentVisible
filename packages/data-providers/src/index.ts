/**
 * The reserved data-provider surface (blueprint Pipeline v2, packages
 * table): KeywordDataProvider and MonitoringRunner interfaces plus their
 * lightweight LLM default implementations. Advanced impls (DataForSEO,
 * Visible, native APIs) implement the same interfaces later without
 * touching callers — the conformance suite in tests/ is the contract.
 */

export { DATA_PROVIDERS_PACKAGE_NAME } from "./package-name.js";
export {
  keywordVolumeCacheKey,
  InMemoryKeywordVolumeCache,
  type KeywordVolumeCache,
  type KeywordVolumeCacheKeyInput,
} from "./cache.js";
export { quarterKey } from "./quarter.js";
export {
  backoffDelayMs,
  completeWithRetry,
  type CompleteWithRetryDeps,
} from "./llm.js";
export {
  type CountryCode,
  type KeywordDataProvider,
  type KeywordVolume,
  type LanguageCode,
} from "./keywords.js";
export {
  type MonitoringRunner,
  type RunResult,
} from "./monitoring.js";
export {
  DEFAULT_RUNS_PER_PROMPT,
  MIN_RUNS_PER_PROMPT,
  enumerateMonitoringRuns,
  type MonitoringRunConfig,
  type MonitoringRunSpec,
} from "./run-config.js";
export {
  DEMAND_ESTIMATION_TEMPERATURE,
  MAX_KEYWORDS_PER_REQUEST,
  GeminiKeywordDataProvider,
  demandEstimationSystemPrompt,
  demandEstimationUserPrompt,
  estimateFromResponse,
  normalizeKeywords,
  type DemandEstimationPromptInput,
  type EstimateContext,
  type KeywordProviderDeps,
} from "./keyword-gemini.js";
export {
  PLATFORM_LABELS,
  PLATFORM_PERSONA_NOTES,
  SIMULATION_TEMPERATURE,
  SimulatedMonitoringRunner,
  extractCitations,
  personaSystemPrompt,
  simulationUserPrompt,
  type SimulatedMonitoringRunnerDeps,
} from "./monitoring-simulated.js";
