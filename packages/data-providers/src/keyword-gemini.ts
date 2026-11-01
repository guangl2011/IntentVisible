/**
 * The lightweight KeywordDataProvider default (blueprint Stage A.3): demand
 * tiers from the configured Gemini adapter — fixed prompt, temperature 0,
 * deterministic per (keyword, country, language, quarter), and cached so
 * repeat runs never re-bill tokens. Tier is always filled;
 * monthly_volume is always null — the LLM never invents volumes, and
 * estimates are consumed only as tiers.
 */

import { z } from "zod";

import {
  DemandEstimateSchema,
  DEMAND_TIERS,
  type DemandTier,
} from "@intentvisible/core-schema";
import {
  DEFAULT_RETRY_OPTIONS,
  LlmError,
  type Clock,
  type LlmAdapter,
  type LlmResponse,
  type RetryOptions,
} from "@intentvisible/intent-engine";

import {
  InMemoryKeywordVolumeCache,
  keywordVolumeCacheKey,
  type KeywordVolumeCache,
} from "./cache.js";
import type { CountryCode, KeywordVolume, LanguageCode } from "./keywords.js";
import type { KeywordDataProvider } from "./keywords.js";
import { quarterKey } from "./quarter.js";
import { completeWithRetry } from "./llm.js";

/** Temperature 0 is the determinism contract (Verification #3) — never configurable. */
export const DEMAND_ESTIMATION_TEMPERATURE = 0;

/** Keywords per estimation batch: one LLM call carries the whole request. */
export const MAX_KEYWORDS_PER_REQUEST = 50;

// strictObject: an entry carrying an invented measurement (a volume field)
// fails parsing outright instead of being stripped and stored.
const TierEntrySchema = z.strictObject({ keyword: z.string().min(1), tier: z.enum(DEMAND_TIERS) });
const TierResponseSchema = z.strictObject({ results: z.array(TierEntrySchema).min(1) });

export interface DemandEstimationPromptInput {
  keywords: readonly string[];
  country: string;
  language: string;
  quarter: string;
}

/** The fixed system prompt — identical on every call, so only the input varies. */
export function demandEstimationSystemPrompt(): string {
  return [
    "You are a demand-estimation analyst for AI-search queries.",
    "For each keyword, judge the plausible demand for that keyword as an AI-assistant search in the given market and quarter.",
    "Reply with ONLY a JSON object, no prose, exactly this shape:",
    '{"results": [{"keyword": "<the keyword verbatim>", "tier": "high" | "medium" | "low"}]}',
    "Rules:",
    "- One result per requested keyword, using the keyword text verbatim.",
    "- Tier only — NEVER output a numeric search volume, monthly_searches, or any number representing demand.",
    "- Base tiers on qualitative reasoning (how mainstream the query is for the market); be consistent: similar queries in the same market get similar tiers.",
  ].join("\n");
}

export function demandEstimationUserPrompt(input: DemandEstimationPromptInput): string {
  return [
    `Market: country ${input.country}, language ${input.language}, quarter ${input.quarter}.`,
    "Keywords to estimate:",
    ...input.keywords.map((keyword, index) => `${index + 1}. ${keyword}`),
  ].join("\n");
}

/** Trimmed, lowercased, deduplicated (order-preserving) keyword list. */
export function normalizeKeywords(keywords: readonly string[]): string[] {
  const normalized: string[] = [];
  for (const keyword of keywords) {
    const trimmed = keyword.trim().toLowerCase();
    if (trimmed !== "" && !normalized.includes(trimmed)) {
      normalized.push(trimmed);
    }
  }
  return normalized;
}

/** Tolerate a ```json fence; the model is instructed to reply with bare JSON. */
function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse((fenced?.[1] ?? text).trim());
}

export interface EstimateContext {
  retrievedAt: string;
}

/**
 * Pure parse of one LLM response into tier entries, then into validated
 * KeywordVolume records for exactly the requested keywords. Unknown or
 * missing keywords, extra results, or malformed JSON are typed
 * invalid_response failures — never silent gaps and never invented tiers.
 */
export function estimateFromResponse(
  response: LlmResponse,
  requested: readonly string[],
  context: EstimateContext,
): KeywordVolume[] {
  let entries: Array<{ keyword: string; tier: DemandTier }>;
  try {
    const parsed = TierResponseSchema.parse(extractJson(response.text));
    entries = parsed.results;
  } catch {
    throw new LlmError(
      "invalid_response",
      "demand-estimation response was not the expected tier JSON ({results: [{keyword, tier}]})",
      false,
    );
  }
  const tierByKeyword = new Map(
    entries.map((entry) => [entry.keyword.trim().toLowerCase(), entry.tier] as const),
  );
  if (tierByKeyword.size !== entries.length) {
    throw new LlmError(
      "invalid_response",
      "demand-estimation response repeated a keyword with conflicting tiers",
      false,
    );
  }
  const missing = requested.filter((keyword) => !tierByKeyword.has(keyword));
  if (missing.length > 0) {
    throw new LlmError(
      "invalid_response",
      `demand-estimation response omitted ${missing.length} requested keyword(s): ${missing.join(", ")}`,
      false,
    );
  }
  return requested.map(
    (keyword) =>
      DemandEstimateSchema.parse({
        keyword,
        tier: tierByKeyword.get(keyword),
        // Hard-set: the LLM estimation path can never carry a volume — the
        // schema invariant rejects any non-null volume on this mode anyway.
        monthly_volume: null,
        data_mode: "llm_estimated",
        provenance: { source: response.model, retrieved_at: context.retrievedAt },
      }) satisfies KeywordVolume,
  );
}

/** Reorder volumes to the requested keyword order (cache entries are stored sorted). */
function orderByRequest(requested: readonly string[], volumes: readonly KeywordVolume[]): KeywordVolume[] {
  const byKeyword = new Map(volumes.map((volume) => [volume.keyword, volume] as const));
  return requested.map((keyword) => {
    const volume = byKeyword.get(keyword);
    if (volume === undefined) {
      throw new LlmError(
        "invalid_response",
        `cache entry is missing keyword "${keyword}" — cache content does not match its key`,
        false,
      );
    }
    return volume;
  });
}

export interface KeywordProviderDeps {
  adapter: LlmAdapter;
  clock: Clock;
  /** Omit for the process-local default; the API layer injects a persistent cache. */
  cache?: KeywordVolumeCache;
  retry?: Partial<RetryOptions>;
}

export class GeminiKeywordDataProvider implements KeywordDataProvider {
  readonly #cache: KeywordVolumeCache;
  readonly #retry: RetryOptions;

  constructor(private readonly deps: KeywordProviderDeps) {
    this.#cache = deps.cache ?? new InMemoryKeywordVolumeCache();
    this.#retry = { ...DEFAULT_RETRY_OPTIONS, ...deps.retry };
  }

  async aiSearchVolume(
    keywords: string[],
    country: CountryCode,
    language: LanguageCode,
  ): Promise<KeywordVolume[]> {
    const requested = normalizeKeywords(keywords);
    if (requested.length === 0) {
      throw new TypeError("aiSearchVolume requires at least one keyword");
    }
    if (requested.length > MAX_KEYWORDS_PER_REQUEST) {
      throw new RangeError(
        `aiSearchVolume accepts at most ${MAX_KEYWORDS_PER_REQUEST} keywords per request (got ${requested.length})`,
      );
    }
    const quarter = quarterKey(this.deps.clock.nowMs());
    const cacheKey = keywordVolumeCacheKey({ keywords: requested, country, language, quarter });

    const cached = await this.#cache.get(cacheKey);
    if (cached !== undefined) {
      return orderByRequest(requested, cached);
    }

    const response = await completeWithRetry(
      { adapter: this.deps.adapter, clock: this.deps.clock, retry: this.#retry },
      {
        system: demandEstimationSystemPrompt(),
        user: demandEstimationUserPrompt({ keywords: requested, country, language, quarter }),
        temperature: DEMAND_ESTIMATION_TEMPERATURE,
      },
    );
    const volumes = estimateFromResponse(response, requested, {
      retrievedAt: this.deps.clock.isoNow(),
    });

    // Canonical cached form: keyword-sorted, so any re-request order reorders on read.
    await this.#cache.set(cacheKey, [...volumes].sort((a, b) => a.keyword.localeCompare(b.keyword)));
    return orderByRequest(requested, volumes);
  }
}
