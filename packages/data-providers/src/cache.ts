/**
 * The keyword-estimation cache seam. The blueprint requires demand tiers to
 * be cached per (keyword, country, language, quarter) so repeat Stage A runs
 * never re-bill tokens; the API layer supplies a persistent implementation,
 * tests use the in-memory one. The LLM default depends only on the
 * interface, so a store-backed cache swaps in without touching it.
 */

import type { KeywordVolume } from "./keywords.js";

export interface KeywordVolumeCache {
  get(key: string): Promise<KeywordVolume[] | undefined>;
  set(key: string, volumes: readonly KeywordVolume[]): Promise<void>;
}

/** Process-local cache — the default seam and the test double. */
export class InMemoryKeywordVolumeCache implements KeywordVolumeCache {
  readonly #entries = new Map<string, KeywordVolume[]>();

  async get(key: string): Promise<KeywordVolume[] | undefined> {
    return this.#entries.get(key);
  }

  async set(key: string, volumes: readonly KeywordVolume[]): Promise<void> {
    // Store a defensive copy: cached entries must not alias live results.
    this.#entries.set(key, volumes.map((volume) => structuredClone(volume)));
  }
}

export interface KeywordVolumeCacheKeyInput {
  keywords: readonly string[];
  country: string;
  language: string;
  quarter: string;
}

/**
 * Deterministic cache key for one estimation batch. Keywords are trimmed,
 * lowercased, deduplicated, and sorted — estimation semantics do not depend
 * on keyword order or case, so ["A", "b"] and ["b ", "a"] share an entry.
 * The quarter is part of the key, so a new quarter re-estimates.
 */
export function keywordVolumeCacheKey(input: KeywordVolumeCacheKeyInput): string {
  const keywords = [...new Set(input.keywords.map((keyword) => keyword.trim().toLowerCase()))].sort();
  return JSON.stringify({
    keywords,
    country: input.country,
    language: input.language,
    quarter: input.quarter,
  });
}
