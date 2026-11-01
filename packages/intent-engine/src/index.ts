/**
 * LLM + deterministic intent generation and QA: evidence-first generation,
 * catalog-driven deterministic extraction, semantic dedup, versioning, and
 * standalone-mode invariant enforcement (spec art_KGYzMB5Z; D3 seam in
 * art_Aj4HcWgx).
 */

export { ENGINE_PACKAGE_NAME } from "./package-name.js";
export { SystemClock, type Clock } from "./clock.js";
export {
  CRAWL_PAGE_CAP_DEFAULT,
  CRAWL_PAGE_CAP_WEEKLY,
  MAX_CRAWL_PAGE_CAP,
  PAGE_PRIORITY_CLASSES,
  classifyPagePriority,
  resolveCrawlCap,
  executeCrawlPlan,
  CRAWL_FAILURE_REASONS,
  type CrawlCapConfig,
  type CrawlFailureReason,
  type CrawlPlanFailure,
  type CrawlPlanInput,
  type CrawlPlanDeps,
  type CrawlPlanOutcome,
  type CrawledPage,
  type PagePriorityClass,
} from "./stage-a/crawl-plan.js";
export {
  FIT_STRONG_THRESHOLD,
  FIT_MODERATE_THRESHOLD,
  derivePriorityTier,
  type ScoringDimensions,
} from "./stage-a/scoring.js";
export {
  MIN_GRAPH_EVIDENCE_PAGES,
  STAGE_A_DROP_REASONS,
  validateTrait,
  collectGraphEvidenceUrls,
  type StageADropEvent,
  type StageADropReason,
  type RawTrait,
  type TraitValidationOutcome,
} from "./stage-a/evidence.js";
export {
  SPOT_CHECK_PROMPT_COUNT,
  entityResolutionSystemPrompt,
  buildEntityResolutionUserPrompt,
  personasSystemPrompt,
  buildPersonasUserPrompt,
  serializeProfileEvidence,
  parseEntityResolution,
  parsePersonasModeling,
  runModelingPass,
  type EntityResolutionPromptInput,
  type EntityResolutionParse,
  type PersonasModelingParse,
  type PersonasPromptInput,
  type ModeledIntentTopic,
  type ModeledPersona,
  type ModelingPassResult,
  type ResolvedCompetitor,
  type ResolvedEntity,
  type StageAProfiles,
} from "./stage-a/modeling.js";
export {
  ModelOutputError,
  StageAFailure,
  completeAndParse,
  type StageAFailureShape,
} from "./stage-a/llm.js";
export {
  runSpotCheck,
  createLlmSpotCheckRunner,
  StageASpotCheckError,
  type SpotCheckAnswer,
  type SpotCheckInput,
  type SpotCheckResult,
  type SpotCheckRunner,
} from "./stage-a/spot-check.js";
export {
  estimateTopicDemand,
  assertVolumeTier,
  StageADemandError,
  MAX_KEYWORDS_PER_STAGE_A_REQUEST,
  type KeywordVolumeSource,
} from "./stage-a/demand.js";
export {
  buildMarketingGraph,
  freshStableId,
  STAGE_A_SCHEMA_VERSION,
  type MarketingGraph,
  type ScoredTopicParts,
  type StageAGraphParts,
} from "./stage-a/graph.js";
export {
  runStageA,
  STAGE_A_FAILURE_REASONS,
  type StageADeps,
  type StageAFailureReason,
  type StageAInput,
  type StageAOutcome,
  type StageAReport,
  type StageAStep,
} from "./stage-a/stage-a.js";
export {
  collectGraphClaims,
  matchClaim,
  type GraphClaim,
} from "./stage-b/claims.js";
export {
  MAX_PROMPTS_PER_INTENT,
  MIN_PROMPTS_PER_INTENT,
  STAGE_B_DROP_REASONS,
  buildExpansionUserPrompt,
  buildPromptRecords,
  dedupPrompts,
  expansionSystemPrompt,
  parseExpansion,
  personaScenarioPairs,
  type ExpandedPromptDraft,
  type ExpansionContext,
  type ExpansionParse,
  type ExpansionPromptInput,
  type ExpansionVoice,
  type PromptCollapse,
  type PromptDedupReport,
  type PromptProvenance,
  type StageBDropEvent,
  type StageBDropReason,
} from "./stage-b/expand.js";
export {
  DEFAULT_BASELINE_ROUNDS,
  DEFAULT_CADENCE,
  DEFAULT_PLAN_DATA_MODE,
  MONITORING_CADENCES,
  MonitoringPlanSchema,
  buildMonitoringPlan,
  type MonitoringCadence,
  type MonitoringPlan,
  type PlanOptions,
} from "./stage-b/plan.js";
export {
  DEFAULT_BATCH_SIZE,
  MAX_BATCH_SIZE,
  applySelectionOverrides,
  selectIntents,
  type IntentSelection,
  type SelectOptions,
  type SelectionReplacement,
} from "./stage-b/select.js";
export {
  DEFAULT_STAGE_B_MARKET,
  STAGE_B_FAILURE_REASONS,
  StageBFailure,
  runStageB,
  type CollapsedPrompt,
  type StageBDeps,
  type StageBFailureReason,
  type StageBInput,
  type StageBMarket,
  type StageBOutcome,
  type StageBReport,
  type StageBStep,
} from "./stage-b/stage-b.js";
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
