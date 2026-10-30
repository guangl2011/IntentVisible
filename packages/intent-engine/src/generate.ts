/**
 * The generation pipeline (spec Flow, Generate and Validate + dedup rows):
 * per-market evidence-first prompts through the adapter with retry/backoff,
 * candidate parsing, validation, and standalone-record construction.
 *
 * Records are built in exactly one place — buildStandaloneRecord — and that
 * place hard-sets the standalone-mode nulls: there is no parameter that
 * could carry a measured value in, so the generator cannot emit one. The
 * core-schema validator re-enforces the invariant as the final gate.
 */

import { z } from "zod";

import {
  CountryCodeSchema,
  IntentRecordSchema,
  LanguageCodeSchema,
  SCHEMA_VERSION,
  type BrandProfile,
  type IntentRecord,
  type ProductProfile,
  type SnapshotRefSchema,
} from "@intentvisible/core-schema";

import { LlmError, type LlmAdapter, type LlmRequest } from "./adapter.js";
import type { Clock } from "./clock.js";
import { dedupDrafts, type ExistingIntentSummary } from "./dedup.js";
import type { DropEvent } from "./drops.js";
import { CandidateParseError, parseCandidates, type ParsedCandidates } from "./parse.js";
import { buildBrandPrompt, buildProductPrompt, type MarketTarget } from "./prompt.js";
import { validateCandidates, type ValidatedDraft } from "./validate.js";

/** Reference to a stored page snapshot — structurally the core-schema SnapshotRef. */
export type SnapshotRef = z.output<typeof SnapshotRefSchema>;

export const GENERATION_FAILURE_REASONS = [
  "no_evidence",
  "llm_unavailable",
  "llm_invalid_output",
  "generation_empty",
] as const;
export type GenerationFailureReason = (typeof GENERATION_FAILURE_REASONS)[number];

export interface RetryOptions {
  /** Total attempts per LLM call (first try + retries) — the budget. */
  max_attempts: number;
  base_delay_ms: number;
  max_delay_ms: number;
}

export const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  max_attempts: 3,
  base_delay_ms: 500,
  max_delay_ms: 8000,
};

export const DEFAULT_MAX_CANDIDATES_PER_MARKET = 20;

export interface GenerationRun {
  markets: readonly MarketTarget[];
  /** Stored snapshots backing this run — the only citable evidence. */
  snapshots: readonly SnapshotRef[];
  /**
   * The library view this run dedups against (spec: re-runs update rather
   * than duplicate). Omit for a first generation.
   */
  existing?: readonly ExistingIntentSummary[];
  retry?: Partial<RetryOptions>;
  /** Cost cap: candidates kept per market, sliced in model order. */
  max_candidates_per_market?: number;
}

export interface GenerationReport {
  /** Candidate count parsed from the LLM across all markets, pre-cap. */
  candidates: number;
  /** Records that survived validation and the final schema gate. */
  kept: number;
  /** Records reusing an existing library intent_id (version bump). */
  reused: number;
  /** Records that minted a fresh intent_id. */
  fresh: number;
  /** Every dropped candidate, logged with reason — never stored. */
  dropped: Array<DropEvent & { market: string }>;
}

export type GenerationOutcome =
  | { ok: true; records: IntentRecord[]; report: GenerationReport }
  | { ok: false; reason: GenerationFailureReason; detail: string };

export interface GeneratorDeps {
  adapter: LlmAdapter;
  clock: Clock;
  /** Optional observer for QA events (drops) — ops logging, not storage. */
  log?: (event: string) => void;
}

const MarketTargetSchema = z.strictObject({
  country: CountryCodeSchema,
  language: LanguageCodeSchema,
});

/** Deterministic, typed failure inside the pipeline; mapped onto the outcome. */
class GenerationFailure extends Error {
  constructor(
    public readonly reason: GenerationFailureReason,
    detail: string,
  ) {
    super(detail);
    this.name = "GenerationFailure";
  }
}

function firstIssueMessage(error: z.ZodError): string {
  const issue = error.issues[0];
  if (issue === undefined) {
    return error.message;
  }
  const path = issue.path.map(String).join(".");
  return `${path === "" ? "root" : path}: ${issue.message}`;
}

function validateMarket(raw: MarketTarget): MarketTarget {
  const parsed = MarketTargetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new TypeError(`GenerationRun.markets entry is malformed: ${firstIssueMessage(parsed.error)}`);
  }
  return parsed.data;
}

function marketTag(market: MarketTarget): string {
  return `${market.country}/${market.language}`;
}

/** Backoff before retry number N (N starts at 1): base, base*2, base*4 … capped. */
function backoffDelayMs(retry: RetryOptions, retryNumber: number): number {
  return Math.min(retry.max_delay_ms, retry.base_delay_ms * 2 ** (retryNumber - 1));
}

interface AttemptOutcome {
  model: string;
  parsed: ParsedCandidates;
}

/**
 * One adapter call plus parse, retried on retryable transport errors and on
 * unparseable model output until the budget is spent. Transport exhaustion
 * fails as llm_unavailable, output exhaustion as llm_invalid_output —
 * deterministic failure after budget, never silent degradation.
 */
async function completeAndParseWithRetry(
  adapter: LlmAdapter,
  request: LlmRequest,
  retry: RetryOptions,
  clock: Clock,
): Promise<AttemptOutcome> {
  let lastTransport = "";
  let lastOutput = "";
  for (let attempt = 1; attempt <= retry.max_attempts; attempt++) {
    if (attempt > 1) {
      await clock.sleep(backoffDelayMs(retry, attempt - 1));
    }
    try {
      const response = await adapter.complete(request);
      return { model: response.model, parsed: parseCandidates(response.text) };
    } catch (error) {
      if (error instanceof CandidateParseError) {
        lastOutput = error.detail;
        continue;
      }
      if (error instanceof LlmError) {
        if (!error.retryable) {
          throw new GenerationFailure("llm_unavailable", `${error.reason}: ${error.message} (non-retryable)`);
        }
        lastTransport = `${error.reason}: ${error.message}`;
        continue;
      }
      throw error;
    }
  }
  if (lastOutput !== "") {
    throw new GenerationFailure(
      "llm_invalid_output",
      `the LLM never produced parseable candidate output within the retry budget (${retry.max_attempts} attempts): ${lastOutput}`,
    );
  }
  throw new GenerationFailure(
    "llm_unavailable",
    `the LLM was still failing after the retry budget (${retry.max_attempts} attempts): ${lastTransport}`,
  );
}

/**
 * The ONE place a generated IntentRecord is constructed. Measurement fields
 * are hard-set to the standalone-mode nulls — there is no parameter that
 * could carry a measured value in, so the generator cannot emit one. The
 * core-schema validator re-enforces the invariant as the final gate.
 */
export function buildStandaloneRecord(
  draft: ValidatedDraft,
  identity: { intent_id: string; intent_version: number },
  build: { generation_model: string; generated_at: string },
): IntentRecord {
  const record = {
    schema_version: SCHEMA_VERSION,
    intent_id: identity.intent_id,
    intent_version: identity.intent_version,
    scope: draft.scope,
    brand_id: draft.brand_id,
    intent_name: draft.intent_name,
    buyer_stage: draft.buyer_stage,
    intent_category: draft.intent_category,
    ...(draft.persona !== undefined ? { persona: draft.persona } : {}),
    ...(draft.pain_point !== undefined ? { pain_point: draft.pain_point } : {}),
    country: draft.country,
    language: draft.language,
    prompts: [...draft.prompts],
    ...(draft.recommended_content !== undefined
      ? { recommended_content: draft.recommended_content }
      : {}),
    ...(draft.recommended_cta !== undefined ? { recommended_cta: draft.recommended_cta } : {}),
    sku_ids: [...draft.sku_ids],
    evidence_urls: [...draft.evidence_urls],
    generation_method: "llm_with_page_evidence",
    generation_model: build.generation_model,
    // Standalone-mode boundary invariant (spec): the nulls, always.
    measurement_status: "not_measured",
    measurement_source: null,
    visibility_pct: null,
    monthly_search_volume: null,
    confidence: draft.confidence,
    opportunity_type: "hypothesis",
    generated_at: build.generated_at,
  } as const;
  const parsed = IntentRecordSchema.parse(record);
  return parsed;
}

export class IntentGenerator {
  constructor(private readonly deps: GeneratorDeps) {}

  /** Brand-level intent generation (category questions, comparisons, scenarios, price, trust). */
  async generateBrandIntents(brand: BrandProfile, run: GenerationRun): Promise<GenerationOutcome> {
    return this.generate(
      { scope: "brand", brand_id: brand.brand_id, allowed_sku_ids: [] },
      (market, evidenceUrls) => buildBrandPrompt(brand, market, evidenceUrls),
      run,
    );
  }

  /** Product-level intent generation (features, compatibility, purchase conditions, after-sales). */
  async generateProductIntents(
    product: ProductProfile,
    run: GenerationRun,
  ): Promise<GenerationOutcome> {
    return this.generate(
      {
        scope: "product",
        brand_id: product.brand_id,
        allowed_sku_ids: product.skus.map((sku) => sku.sku_id),
      },
      (market, evidenceUrls) => buildProductPrompt(product, market, evidenceUrls),
      run,
    );
  }

  private async generate(
    input: {
      scope: "brand" | "product";
      brand_id: string;
      allowed_sku_ids: readonly string[];
    },
    buildPrompt: (market: MarketTarget, evidenceUrls: readonly string[]) => { system: string; user: string },
    run: GenerationRun,
  ): Promise<GenerationOutcome> {
    if (run.markets.length === 0) {
      throw new TypeError("GenerationRun.markets must not be empty");
    }
    const markets = run.markets.map(validateMarket);
    if (run.snapshots.length === 0) {
      return {
        ok: false,
        reason: "no_evidence",
        detail: "no stored snapshots were supplied — nothing is citable, so generation refuses to run",
      };
    }
    const registryUrls = run.snapshots.map((snapshot) => snapshot.url);
    const retry: RetryOptions = { ...DEFAULT_RETRY_OPTIONS, ...run.retry };
    const maxCandidates = run.max_candidates_per_market ?? DEFAULT_MAX_CANDIDATES_PER_MARKET;

    // Markets run sequentially: deterministic order, backoff per market.
    const parsedByMarket: Array<{ market: MarketTarget; outcome: AttemptOutcome }> = [];
    for (const market of markets) {
      const prompt = buildPrompt(market, registryUrls);
      try {
        const outcome = await completeAndParseWithRetry(
          this.deps.adapter,
          { system: prompt.system, user: prompt.user },
          retry,
          this.deps.clock,
        );
        parsedByMarket.push({ market, outcome });
      } catch (error) {
        if (error instanceof GenerationFailure) {
          return {
            ok: false,
            reason: error.reason,
            detail: `[${marketTag(market)}] ${error.message}`,
          };
        }
        throw error;
      }
    }

    // Validate per market (identity injected from the pipeline, not the model).
    const dropped: Array<DropEvent & { market: string }> = [];
    const acceptedDrafts: ValidatedDraft[] = [];
    let candidateCount = 0;
    for (const { market, outcome } of parsedByMarket) {
      candidateCount += outcome.parsed.candidates.length;
      for (const event of outcome.parsed.dropped) {
        dropped.push({ ...event, market: marketTag(market) });
      }
      const summary = validateCandidates(outcome.parsed.candidates.slice(0, maxCandidates), {
        scope: input.scope,
        brand_id: input.brand_id,
        country: market.country,
        language: market.language,
        allowed_evidence_urls: registryUrls,
        allowed_sku_ids: input.allowed_sku_ids,
        generation_model: outcome.model,
      });
      for (const event of summary.dropped) {
        dropped.push({ ...event, market: marketTag(market) });
      }
      acceptedDrafts.push(...summary.accepted);
    }

    // Semantic dedup against the library view: paraphrases reuse the
    // existing intent_id with a version bump instead of being stored as
    // separate billable intents (spec Validate + dedup row).
    const dedup = dedupDrafts(acceptedDrafts, run.existing ?? []);

    const generatedAt = this.deps.clock.isoNow();
    const records: IntentRecord[] = dedup.assigned.map((assignment) =>
      buildStandaloneRecord(
        assignment.draft,
        { intent_id: assignment.intent_id, intent_version: assignment.intent_version },
        { generation_model: assignment.draft.generation_model, generated_at: generatedAt },
      ),
    );

    for (const event of dropped) {
      this.deps.log?.(`dropped candidate ${event.intent_name ?? "<unnamed>"} [${event.market}] ${event.reason}: ${event.detail}`);
    }

    if (records.length === 0) {
      const summary =
        dropped.length > 0
          ? `all ${candidateCount} candidate(s) were dropped: ${dropped.map((event) => event.reason).join(", ")}`
          : "the LLM returned no candidates";
      return { ok: false, reason: "generation_empty", detail: summary };
    }

    return {
      ok: true,
      records,
      report: { candidates: candidateCount, kept: records.length, reused: dedup.reused, fresh: dedup.fresh, dropped },
    };
  }
}
