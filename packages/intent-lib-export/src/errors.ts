/**
 * Typed errors for the intent-lib-export package. Every rejection is a
 * typed, descriptive error — never a silent default (blueprint validation
 * family 2: mode leakage is the one unforgivable bug, so a simulated lib
 * without its Data Mode header is rejected at validation, not rendered).
 */

export const LIB_EXPORT_ERROR_CODES = [
  "LIB_INPUT_INVALID",
  "MIXED_DATA_MODE",
  "POOLED_SNAPSHOT_MISSING",
  "LIB_VALIDATION_FAILED",
] as const;

export type LibExportErrorCode = (typeof LIB_EXPORT_ERROR_CODES)[number];

/** Base class for every lib-export rejection. */
export class LibExportError extends Error {
  readonly code: LibExportErrorCode;

  constructor(code: LibExportErrorCode, message: string) {
    super(message);
    this.name = "LibExportError";
    this.code = code;
  }
}

/** The renderer was handed input it cannot render over (malformed or dangling references). */
export class LibInputError extends LibExportError {
  constructor(message: string) {
    super("LIB_INPUT_INVALID", message);
    this.name = "LibInputError";
  }
}

/**
 * One monitoring plan is one data mode (blueprint data-mode integrity):
 * a lib that mixes `llm_simulated` and `provider_measured` inputs is never
 * rendered — the caller must split it into per-mode libs.
 */
export class MixedDataModeError extends LibExportError {
  readonly foundModes: string[];

  constructor(foundModes: string[]) {
    super(
      "MIXED_DATA_MODE",
      `a lib export cannot mix data modes; found: ${[...foundModes].sort().join(", ")}`,
    );
    this.name = "MixedDataModeError";
    this.foundModes = foundModes;
  }
}

/** A prompt's pooled metrics snapshot is absent — per-platform snapshots must be pooled first. */
export class PooledSnapshotMissingError extends LibExportError {
  readonly promptId: string;

  constructor(promptId: string) {
    super(
      "POOLED_SNAPSHOT_MISSING",
      `prompt ${promptId} has per-platform snapshots but no pooled snapshot; pool them with computePooledMetrics before exporting`,
    );
    this.name = "PooledSnapshotMissingError";
    this.promptId = promptId;
  }
}

/** A rendered or handed-in export fails Export Spec v2 conformance (e.g. missing Data Mode header). */
export class LibValidationError extends LibExportError {
  constructor(message: string) {
    super("LIB_VALIDATION_FAILED", message);
    this.name = "LibValidationError";
  }
}
