/**
 * Stage A.4 — the deterministic S/A/B derivation (blueprint: "the tier is
 * derived, never authored"). Pure code over the three stored dimensions —
 * no LLM in the scoring path (PSI Skill step 5: Priority = f(Volume, Fit,
 * Gap)).
 *
 * Mapping (blueprint Stage A.4):
 *   S = volume tier high + fit strong + gap open
 *   A = clear demand but entrenched competitors
 *   B = long-tail or monopolized
 *
 * The Stage A gap dimension is the brand-level spot-check Void Rate (the
 * 10-prompt probe runs before any intent topic exists), so PSI's analyst
 * distinction between "competitors hold half the answers" and "one
 * competitor monopolizes" collapses into the single open/entrenched
 * boundary here. Per-prompt Stage C metrics refine the picture later.
 */

import { VOID_OPPORTUNITY_THRESHOLD_PCT } from "@intentvisible/metrics";
import type { DemandTier, PriorityTier } from "@intentvisible/core-schema";

/** "Fit strong" boundary for the S tier. The 0.5 floor is the mismatch boundary the core schema enforces. */
export const FIT_STRONG_THRESHOLD = 0.7;

/** Fit at or above this is usable demand ("clear demand" for the A tier); below it names a mismatch. */
export const FIT_MODERATE_THRESHOLD = 0.5;

/** The three raw scoring dimensions stored alongside the derived tier. */
export interface ScoringDimensions {
  volume_tier: DemandTier;
  fit_score: number;
  void_rate_pct: number;
}

/**
 * Derives the S/A/B priority from the three dimensions. Volume "low" is
 * the long tail and fit below the mismatch floor is a business mismatch —
 * both are B no matter how open the gap; a monopolized-but-attractive
 * topic (high volume, strong fit, entrenched competitors) is the A tier's
 * "break through with differentiated evidence" case.
 */
export function derivePriorityTier(dimensions: ScoringDimensions): PriorityTier {
  const fitStrong = dimensions.fit_score >= FIT_STRONG_THRESHOLD;
  const gapOpen = dimensions.void_rate_pct >= VOID_OPPORTUNITY_THRESHOLD_PCT;
  if (dimensions.volume_tier === "high" && fitStrong && gapOpen) {
    return "S";
  }
  if (dimensions.volume_tier === "low" || dimensions.fit_score < FIT_MODERATE_THRESHOLD) {
    return "B";
  }
  return "A";
}
