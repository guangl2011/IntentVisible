/**
 * Stage A — from installed-site crawl to a validated Marketing Graph
 * (blueprint "Stage A: The Crawl-to-Graph Foundation"). One orchestration,
 * six steps, every failure typed:
 *
 *   1. crawl plan   — priority-page walk, robots-aware, domain-bounded,
 *                     cap 50 (default) / 100 (weekly opt-in)
 *   2. profiles     — deterministic extraction over the snapshots
 *   3. A.1 entity   — LLM pass: business model, value prop, moats,
 *                     competitors, 10 spot-check prompts
 *   4. spot check   — simulated 10-prompt probe → pooled Void Rate
 *   5. A.2 personas — LLM pass: MECE personas, scenarios, intent topics
 *   6. A.3+A.4      — tier-only demand + deterministic S/A/B + graph
 *
 * The no-hallucination contract holds end to end: uncited claims are
 * dropped with typed events, and a graph that cannot cite at least
 * MIN_GRAPH_EVIDENCE_PAGES crawl URLs fails loudly — a typed failure, no
 * graph — instead of inventing.
 */

import { extractProfiles, type UrlFetcher, type SnapshotStore } from "@intentvisible/url-extractor";

import type { Clock } from "../clock.js";
import type { LlmAdapter } from "../adapter.js";
import { DEFAULT_RETRY_OPTIONS, type RetryOptions } from "../generate.js";
import { resolveCrawlCap, executeCrawlPlan, type CrawlCapConfig, type CrawlPlanFailure } from "./crawl-plan.js";
import { runModelingPass, parseEntityResolution, parsePersonasModeling, buildEntityResolutionUserPrompt, buildPersonasUserPrompt, entityResolutionSystemPrompt, personasSystemPrompt, serializeProfileEvidence, type ResolvedEntity, type ModeledPersona, type ModeledIntentTopic } from "./modeling.js";
import { StageAFailure } from "./llm.js";
import { runSpotCheck, type SpotCheckRunner, type SpotCheckResult } from "./spot-check.js";
import { estimateTopicDemand, type KeywordVolumeSource } from "./demand.js";
import { buildMarketingGraph, type MarketingGraph, type ScoredTopicParts } from "./graph.js";
import { MIN_GRAPH_EVIDENCE_PAGES, collectGraphEvidenceUrls, type StageADropEvent } from "./evidence.js";

/** Every reason Stage A can fail with — all of them typed, none silent. */
export const STAGE_A_FAILURE_REASONS = [
  "crawl_robots_blocked",
  "crawl_unreachable",
  "domain_violation",
  "insufficient_evidence",
  "llm_unavailable",
  "llm_invalid_output",
  "modeling_empty",
  "spot_check_failed",
  "estimation_failed",
  "graph_invalid",
] as const;
export type StageAFailureReason = (typeof STAGE_A_FAILURE_REASONS)[number];

export interface StageAInput {
  /** The installed site's home URL — crawl seed and domain bound. */
  siteUrl: string;
  brand: { brand_id: string; name: string };
  market: { country: string; language: string };
  /** Project config the crawl cap derives from (50 default / 100 weekly). */
  crawl?: CrawlCapConfig;
  /** Bumped by later cycles or Gate 1 edits; 1 on first generation. */
  graph_version?: number;
}

export interface StageADeps {
  /** The v1 robots-aware fetcher (url-extractor); the plan drives it page by page. */
  fetcher: Pick<UrlFetcher, "fetchPage">;
  snapshotStore: SnapshotStore;
  clock: Clock;
  /** The modeling LLM (A.1 + A.2). */
  adapter: LlmAdapter;
  /** Retry budget overrides for the modeling passes; defaults to the v1 generator budget. */
  retry?: Partial<RetryOptions>;
  /** Tier-only keyword demand provider (A.3; structural KeywordDataProvider contract). */
  keywordProvider: KeywordVolumeSource;
  /** The simulated visibility probe (A.1 spot check; v1 SimulatedMonitoringRunner fits). */
  spotCheckRunner: SpotCheckRunner;
  /**
   * Optional per-phase progress hook — the pipeline orchestrator maps these
   * onto its job state machine (crawling → research → modeling → estimating).
   */
  onStep?: (step: StageAStep) => void;
}

/** Pipeline state-machine statuses Stage A walks through, in run order. */
export type StageAStep = "crawling" | "research" | "modeling" | "estimating";

export interface StageAReport {
  pages_crawled: number;
  crawl_failures: CrawlPlanFailure[];
  /** QA log of dropped claims/nodes — dropped pieces are never stored. */
  dropped: StageADropEvent[];
  spot_check: { void_rate_pct: number; visibility_pct: number; gap_open: boolean; platform: string };
  graph_id: string;
  graph_version: number;
  evidence_pages_cited: number;
}

export type StageAOutcome =
  | { ok: true; graph: MarketingGraph; report: StageAReport }
  | {
      ok: false;
      reason: StageAFailureReason;
      detail: string;
      crawl_failures: CrawlPlanFailure[];
      dropped: StageADropEvent[];
    };

function failure(
  reason: StageAFailureReason,
  detail: string,
  crawlFailures: CrawlPlanFailure[] = [],
  dropped: StageADropEvent[] = [],
): { ok: false; reason: StageAFailureReason; detail: string; crawl_failures: CrawlPlanFailure[]; dropped: StageADropEvent[] } {
  return { ok: false, reason, detail, crawl_failures: crawlFailures, dropped };
}

/**
 * Runs Stage A end to end. Malformed Stage A input (bad URL, illegal cap)
 * throws a TypeError — a caller bug, not a job failure; everything the
 * site or the model can do wrong comes back as a typed outcome.
 */
export async function runStageA(input: StageAInput, deps: StageADeps): Promise<StageAOutcome> {
  const cap = resolveCrawlCap(input.crawl ?? {});
  const graphVersion = input.graph_version ?? 1;
  const retry: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...deps.retry };

  deps.onStep?.("crawling");
  // --- 1. crawl plan ---
  const crawl = await executeCrawlPlan(
    { siteUrl: input.siteUrl, cap },
    { fetcher: deps.fetcher, snapshotStore: deps.snapshotStore, clock: deps.clock },
  );
  if (!crawl.ok) {
    return failure(crawl.reason, crawl.detail, crawl.failures);
  }

  // --- 2. deterministic extraction over the snapshots ---
  const extraction = extractProfiles(
    crawl.pages.map((page) => ({ snapshot: page.snapshot, stored: page.stored })),
    deps.clock,
  );
  if (!extraction.ok) {
    return failure(
      "insufficient_evidence",
      `the crawl yielded no extractable content: ${extraction.detail}`,
      crawl.failures,
    );
  }

  const registry = new Set(crawl.pages.map((page) => page.stored.url));
  const evidence = serializeProfileEvidence({
    brand: extraction.brand,
    product: extraction.product,
    landing_pages: extraction.landing_pages,
  });

  // --- 3. A.1 entity resolution ---
  deps.onStep?.("research");
  let entityParse: Awaited<ReturnType<typeof runEntityPass>>;
  try {
    entityParse = await runEntityPass(input, deps, evidence, registry, retry);
  } catch (error) {
    if (StageAFailureInstance(error)) {
      return failure(error.reason, error.detail, crawl.failures);
    }
    throw error;
  }
  const { entity, entityModel, entityDropped } = entityParse;

  // --- 4. simulated 10-prompt spot check ---
  let spotCheck: SpotCheckResult;
  try {
    spotCheck = await runSpotCheck(
      {
        prompts: entity.spot_check_prompts,
        brandId: input.brand.brand_id,
        brandName: input.brand.name,
        competitorNames: entity.competitors.map((competitor) => competitor.name),
      },
      deps.spotCheckRunner,
    );
  } catch (error) {
    return failure(
      "spot_check_failed",
      error instanceof Error ? error.message : "the spot-check runner failed",
      crawl.failures,
      entityDropped,
    );
  }

  // --- 5. A.2 personas, scenarios, candidate intent topics ---
  deps.onStep?.("modeling");
  let modelingParse: Awaited<ReturnType<typeof runPersonasPass>>;
  try {
    modelingParse = await runPersonasPass(input, deps, evidence, entity, registry, retry);
  } catch (error) {
    if (StageAFailureInstance(error)) {
      return failure(error.reason, error.detail, crawl.failures, entityDropped);
    }
    throw error;
  }
  const { personas, topics, modelingModel, modelingDropped } = modelingParse;
  const dropped = [...entityDropped, ...modelingDropped];
  if (personas.length === 0 || topics.length === 0) {
    return failure(
      "modeling_empty",
      `modeling produced no usable output (${personas.length} valid personas, ${topics.length} valid intent topics) — refusing to synthesize a graph`,
      crawl.failures,
      dropped,
    );
  }

  // --- 6. tier-only demand (A.3), then assembly + deterministic tier (A.4) ---
  deps.onStep?.("estimating");
  const scoredTopics: ScoredTopicParts[] = [];
  try {
    for (const topic of topics) {
      scoredTopics.push({
        topic,
        volume: await estimateTopicDemand(
          topic,
          deps.keywordProvider,
          input.market.country,
          input.market.language,
        ),
      });
    }
  } catch (error) {
    return failure(
      "estimation_failed",
      error instanceof Error ? error.message : "keyword demand estimation failed",
      crawl.failures,
      dropped,
    );
  }

  let assembled: ReturnType<typeof buildMarketingGraph>;
  try {
    assembled = buildMarketingGraph({
      brandId: input.brand.brand_id,
      brandName: input.brand.name,
      graphVersion,
      generatedAt: deps.clock.isoNow(),
      entityModel: entityModel,
      modelingModel: modelingModel,
      entity,
      spotCheck,
      personas,
      scoredTopics,
    });
  } catch (error) {
    return failure(
      "graph_invalid",
      `the assembled graph did not satisfy the v2 MarketingGraph schema: ${error instanceof Error ? error.message.slice(0, 500) : "unknown error"}`,
      crawl.failures,
      dropped,
    );
  }

  // --- the no-hallucination floor: cite enough pages or fail loudly ---
  const cited = collectGraphEvidenceUrls(assembled.graph);
  if (cited.size < MIN_GRAPH_EVIDENCE_PAGES) {
    return failure(
      "insufficient_evidence",
      `the graph cites only ${cited.size} crawled page(s) but at least ${MIN_GRAPH_EVIDENCE_PAGES} are required — a low-evidence crawl cannot produce a trustworthy graph, so none is returned`,
      crawl.failures,
      dropped,
    );
  }

  return {
    ok: true,
    graph: assembled.graph,
    report: {
      pages_crawled: crawl.pages.length,
      crawl_failures: crawl.failures,
      dropped: [...dropped, ...assembled.dropped],
      spot_check: {
        void_rate_pct: spotCheck.void_rate_pct,
        visibility_pct: spotCheck.visibility_pct,
        gap_open: spotCheck.gap_open,
        platform: spotCheck.platform,
      },
      graph_id: assembled.graph.graph_id,
      graph_version: assembled.graph.graph_version,
      evidence_pages_cited: cited.size,
    },
  };
}

function StageAFailureInstance(error: unknown): error is StageAFailure {
  return error instanceof StageAFailure;
}

async function runEntityPass(
  input: StageAInput,
  deps: StageADeps,
  evidence: string,
  registry: ReadonlySet<string>,
  retry: RetryOptions,
): Promise<{ entity: ResolvedEntity; entityModel: string; entityDropped: StageADropEvent[] }> {
  const pass = await runModelingPass(
    { adapter: deps.adapter, clock: deps.clock, retry },
    {
      system: entityResolutionSystemPrompt(),
      user: buildEntityResolutionUserPrompt({
        brandName: input.brand.name,
        country: input.market.country,
        language: input.market.language,
        evidence,
      }),
      temperature: 0,
    },
    parseEntityResolution,
    registry,
  );
  return { entity: pass.result.entity, entityModel: pass.model, entityDropped: pass.result.dropped };
}

async function runPersonasPass(
  input: StageAInput,
  deps: StageADeps,
  evidence: string,
  entity: ResolvedEntity,
  registry: ReadonlySet<string>,
  retry: RetryOptions,
): Promise<{ personas: ModeledPersona[]; topics: ModeledIntentTopic[]; modelingModel: string; modelingDropped: StageADropEvent[] }> {
  const pass = await runModelingPass(
    { adapter: deps.adapter, clock: deps.clock, retry },
    {
      system: personasSystemPrompt(),
      user: buildPersonasUserPrompt({
        brandName: input.brand.name,
        country: input.market.country,
        language: input.market.language,
        valueProposition: entity.value_proposition.text,
        competitorNames: entity.competitors.map((competitor) => competitor.name),
        evidence,
      }),
      temperature: 0,
    },
    parsePersonasModeling,
    registry,
  );
  return {
    personas: pass.result.personas,
    topics: pass.result.intent_topics,
    modelingModel: pass.model,
    modelingDropped: pass.result.dropped,
  };
}
