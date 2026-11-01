import { MetricsInputError } from "./errors.js";
import { round2 } from "./sentiment.js";
import type { BrandId } from "./types.js";

/**
 * Pure metric formulas (Monitor Skill §4; blueprint Stage C.2). Each is a
 * unit-tested arithmetic function over parsed-run counts — no LLM, no I/O,
 * no stored state: metrics are derived, never stored as source.
 */

/** Guard every percentage denominator and numerator pair. */
function assertCounts(numerator: number, total: number, metric: string): void {
  if (!Number.isInteger(total) || total < 1) {
    throw new MetricsInputError(`${metric} needs at least one answer run; got ${total}`);
  }
  if (!Number.isInteger(numerator) || numerator < 0 || numerator > total) {
    throw new MetricsInputError(`${metric} numerator must be an integer in [0, ${total}]; got ${numerator}`);
  }
}

/**
 * Visibility % = answers mentioning the brand / total answers × 100.
 * (Monitor Skill §4: 提及目标品牌的回答数 / 总回答样本数 × 100%.)
 */
export function visibilityPct(mentioningAnswers: number, totalAnswers: number): number {
  assertCounts(mentioningAnswers, totalAnswers, "visibility");
  return round2((mentioningAnswers / totalAnswers) * 100);
}

/**
 * Void Rate % = answers recommending no monitored competitor / total
 * answers × 100. (Monitor Skill §4: 未推荐任何监测竞品的回答数.)
 * Per the formula, an answer that recommends only the target brand also
 * counts as void — it names no monitored competitor.
 */
export function voidRatePct(voidAnswers: number, totalAnswers: number): number {
  assertCounts(voidAnswers, totalAnswers, "void rate");
  return round2((voidAnswers / totalAnswers) * 100);
}

/**
 * Void Rate ≥ 25% auto-tags the prompt as a high-differentiation
 * opportunity (Monitor Skill §4; blueprint Stage A.4 / C.2). Exactly 25%
 * qualifies — the comparison is inclusive.
 */
export const VOID_OPPORTUNITY_THRESHOLD_PCT = 25;

export function isHighDifferentiationOpportunity(voidRate: number): boolean {
  return voidRate >= VOID_OPPORTUNITY_THRESHOLD_PCT;
}

/** Leader Gap output: the top-1 competitor and its gap over the brand. */
export interface LeaderGap {
  /** Lexicographically first competitor id on a tie (deterministic). */
  topCompetitorId: BrandId | null;
  /** top-1 competitor visibility − brand visibility; negative if the brand leads. */
  gapPct: number | null;
}

/**
 * Leader Gap = top-1 competitor visibility − brand visibility (Monitor
 * Skill §4). A gap always names its leader; when no competitor has any
 * visibility (or none is monitored) there is no leader and no gap — the
 * pair is null together, matching MetricsSnapshotSchema's invariant.
 * Visibility ties break deterministically to the lexicographically
 * smallest competitor id.
 */
export function leaderGap(
  brandVisibility: number,
  competitorVisibilities: ReadonlyArray<{ competitorId: BrandId; visibilityPct: number }>,
): LeaderGap {
  let top: { competitorId: BrandId; visibilityPct: number } | null = null;
  for (const candidate of competitorVisibilities) {
    if (candidate.visibilityPct <= 0) {
      continue;
    }
    if (
      top === null ||
      candidate.visibilityPct > top.visibilityPct ||
      (candidate.visibilityPct === top.visibilityPct && candidate.competitorId < top.competitorId)
    ) {
      top = candidate;
    }
  }
  if (top === null) {
    return { topCompetitorId: null, gapPct: null };
  }
  return { topCompetitorId: top.competitorId, gapPct: round2(top.visibilityPct - brandVisibility) };
}

/** Citation share of one domain, matching core-schema's CitationShareSchema. */
export interface CitationShare {
  domain: string;
  share_pct: number;
}

/**
 * Citation Share per domain = that domain's citations / all citations ×
 * 100 (Monitor Skill §4). Counts are per-answer independent citations: an
 * answer citing the same domain twice contributes once. Sorted by share
 * descending, then domain ascending. No citations → empty array (a 0/0
 * share is undefined, not zero).
 */
export function citationShares(
  citationCountsPerDomain: Readonly<Record<string, number>>,
): CitationShare[] {
  const entries = Object.entries(citationCountsPerDomain).filter(([, count]) => count > 0);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (total === 0) {
    return [];
  }
  return entries
    .map(([domain, count]) => ({ domain, share_pct: round2((count / total) * 100) }))
    .sort((a, b) => b.share_pct - a.share_pct || (a.domain < b.domain ? -1 : 1));
}
