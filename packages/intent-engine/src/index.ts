/**
 * LLM + deterministic intent generation and QA: evidence-first generation,
 * catalog-driven deterministic extraction, semantic dedup, versioning, and
 * standalone-mode invariant enforcement (spec art_KGYzMB5Z; D3 seam in
 * art_Aj4HcWgx).
 */

export { ENGINE_PACKAGE_NAME } from "./package-name.js";
export { SystemClock, type Clock } from "./clock.js";
export {
  FetchChatAdapter,
  LlmError,
  LLM_ERROR_REASONS,
  type FetchChatAdapterOptions,
  type FetchLike,
  type LlmAdapter,
  type LlmErrorReason,
  type LlmRequest,
  type LlmResponse,
} from "./adapter.js";
export { slugify } from "./slug.js";
export {
  GEMINI_OPENAI_BASE_URL,
  LLM_API_KEY_ENV,
  resolveProviderConfig,
  type ProviderConfigOutcome,
  type ResolvedProviderConfig,
} from "./provider-config.js";
export {
  BRAND_INTENT_CATEGORIES,
  PRODUCT_INTENT_CATEGORIES,
  buildBrandPrompt,
  buildProductPrompt,
  intentSystemPrompt,
  type MarketTarget,
  type PromptBuild,
} from "./prompt.js";
export {
  CandidateIntentSchema,
  CandidateParseError,
  parseCandidates,
  type CandidateIntent,
  type ParsedCandidates,
} from "./parse.js";
export {
  VALIDATION_REJECTION_REASONS,
  type DropEvent,
  type ValidationRejectionReason,
} from "./drops.js";
export {
  validateCandidate,
  validateCandidates,
  type ValidatedDraft,
  type ValidationContext,
  type ValidationOutcome,
  type ValidationSummary,
} from "./validate.js";
export {
  dedupDrafts,
  freshIntentId,
  summaryOf,
  tokenOverlap,
  type DedupReport,
  type ExistingIntentSummary,
  type IntentAssignment,
} from "./dedup.js";
export {
  DEFAULT_MAX_CANDIDATES_PER_MARKET,
  DEFAULT_RETRY_OPTIONS,
  GENERATION_FAILURE_REASONS,
  IntentGenerator,
  buildStandaloneRecord,
  validateMarket,
  type GenerationFailureReason,
  type GenerationOutcome,
  type GenerationReport,
  type GenerationRun,
  type GeneratorDeps,
  type RetryOptions,
  type SnapshotRef,
} from "./generate.js";
export type { IntentGeneratorSeam } from "./generate.js";
export {
  DETERMINISTIC_GENERATION_METHOD,
  DeterministicIntentGenerator,
  type DeterministicGeneratorDeps,
} from "./deterministic.js";
