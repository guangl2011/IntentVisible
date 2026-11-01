import { MetricsInputError } from "./errors.js";

/**
 * Baseline consensus (blueprint Stage C.2): per prompt × platform, the
 * visibility of every baseline round must agree within ±10 points before
 * a prompt's number publishes as stable; divergent prompts are flagged
 * noisy (a finding to re-run, not noise to hide).
 */
export const CONSENSUS_TOLERANCE_PTS = 10;

export type ConsensusFlag = "stable" | "noisy";

/**
 * Flag the round visibilities: spread (max − min) within tolerance is
 * stable. At least two rounds are required — a single round cannot
 * demonstrate agreement, and the Monitor Skill sets the per-platform
 * minimum at 2 runs.
 */
export function consensusFlag(roundVisibilities: ReadonlyArray<number>): ConsensusFlag {
  if (roundVisibilities.length < 2) {
    throw new MetricsInputError(
      `consensus needs at least 2 baseline rounds; got ${roundVisibilities.length}`,
    );
  }
  const max = Math.max(...roundVisibilities);
  const min = Math.min(...roundVisibilities);
  return max - min <= CONSENSUS_TOLERANCE_PTS ? "stable" : "noisy";
}
