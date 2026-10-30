/**
 * Validation drop events — the QA log for candidates that never reach
 * storage (spec Flow, Validate + dedup row: "dropped with a QA log entry,
 * never stored").
 */

export const VALIDATION_REJECTION_REASONS = [
  "fabricated_measurement",
  "missing_evidence",
  "unevidenced_claim",
  "schema_invalid",
] as const;
export type ValidationRejectionReason = (typeof VALIDATION_REJECTION_REASONS)[number];

export interface DropEvent {
  /** intent_name when the offending candidate declared one. */
  intent_name: string | undefined;
  reason: ValidationRejectionReason;
  detail: string;
}
