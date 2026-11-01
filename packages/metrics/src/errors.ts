/**
 * Typed errors for the metrics package. Every rejection is a typed,
 * descriptive error — never a silent default (blueprint validation family
 * 2: mixed-mode metrics are rejected, not smoothed over).
 */

export const METRICS_ERROR_CODES = [
  "METRICS_INPUT_INVALID",
  "MIXED_DATA_MODE",
] as const;

export type MetricsErrorCode = (typeof METRICS_ERROR_CODES)[number];

/** Base class for every metrics-computation rejection. */
export class MetricsError extends Error {
  readonly code: MetricsErrorCode;

  constructor(code: MetricsErrorCode, message: string) {
    super(message);
    this.name = "MetricsError";
    this.code = code;
  }
}

/**
 * A metric computation was handed input it cannot compute over: zero
 * runs, fewer than two baseline rounds for a consensus, an empty
 * denominator, or a malformed alias set.
 */
export class MetricsInputError extends MetricsError {
  constructor(message: string) {
    super("METRICS_INPUT_INVALID", message);
    this.name = "MetricsInputError";
  }
}

/**
 * One monitoring plan is one data mode (blueprint data-mode integrity):
 * a baseline that mixes `llm_simulated` and `provider_measured` runs is
 * never aggregated — the caller must start a new baseline instead.
 */
export class MixedDataModeError extends MetricsError {
  readonly foundModes: string[];

  constructor(foundModes: string[]) {
    super(
      "MIXED_DATA_MODE",
      `metrics cannot mix data modes in one baseline; found: ${foundModes
        .sort()
        .join(", ")}`,
    );
    this.name = "MixedDataModeError";
    this.foundModes = foundModes;
  }
}
