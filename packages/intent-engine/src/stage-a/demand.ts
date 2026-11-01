/**
 * Stage A.3 — keyword demand estimation through the reserved provider
 * interface (blueprint A.3: "through KeywordDataProvider — the simulated
 * Gemini keyword-estimation provider"). intent-engine cannot import
 * data-providers (it is a dependency of it), so the contract is declared
 * structurally here and the wired implementation is injected: the v1
 * GeminiKeywordDataProvider and any future measured provider satisfy it
 * as-is.
 *
 * Tiers only (Verification #3): whatever numbers a provider computes
 * internally, Stage A stores the tier — never a number a customer could
 * copy.
 */

import type { DemandEstimate, DemandTier } from "@intentvisible/core-schema";

/** The KeywordDataProvider request surface Stage A uses (structural contract of data-providers). */
export interface KeywordVolumeSource {
  aiSearchVolume(
    keywords: string[],
    country: string,
    language: string,
  ): Promise<DemandEstimate[]>;
}

/** The v1 provider returns one estimate per keyword in order; Stage A depends on that pairing. */
export const MAX_KEYWORDS_PER_STAGE_A_REQUEST = 10;

export class StageADemandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StageADemandError";
  }
}

/**
 * Estimates demand for one candidate topic's keywords. The first keyword
 * is the topic's primary demand phrase; its tier is the topic's volume
 * dimension. A provider that returns a mismatched or duplicate keyword
 * list is a provider contract violation — a typed error, never a guessed
 * pairing.
 */
export async function estimateTopicDemand(
  topic: { intent_name: string; keywords: string[] },
  source: KeywordVolumeSource,
  country: string,
  language: string,
): Promise<DemandEstimate> {
  if (topic.keywords.length === 0) {
    throw new StageADemandError(`intent topic "${topic.intent_name}" has no keywords to estimate`);
  }
  const keywords = topic.keywords.slice(0, MAX_KEYWORDS_PER_STAGE_A_REQUEST);
  const estimates = await source.aiSearchVolume(keywords, country, language);
  if (estimates.length !== keywords.length) {
    throw new StageADemandError(
      `keyword provider returned ${estimates.length} estimates for ${keywords.length} keywords on "${topic.intent_name}"`,
    );
  }
  const byKeyword = new Map<string, DemandEstimate>();
  for (const estimate of estimates) {
    if (byKeyword.has(estimate.keyword)) {
      throw new StageADemandError(
        `keyword provider returned duplicate estimates for "${estimate.keyword}"`,
      );
    }
    byKeyword.set(estimate.keyword, estimate);
  }
  const primary = byKeyword.get(keywords[0] ?? "");
  if (!primary) {
    throw new StageADemandError(
      `keyword provider did not return an estimate for the primary keyword "${String(keywords[0])}"`,
    );
  }
  return primary;
}

/** Volume tiers accepted by the deterministic scoring (any other tier is a provider contract violation). */
export function assertVolumeTier(tier: DemandTier): DemandTier {
  if (tier !== "high" && tier !== "medium" && tier !== "low") {
    throw new StageADemandError(`keyword provider returned an unknown demand tier: ${String(tier)}`);
  }
  return tier;
}
