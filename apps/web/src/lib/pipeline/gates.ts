import type { GateDecision, GateReview } from "@intentvisible/client";

import { getPipelineClient } from "./client";
import { loadPipeline, type LoadResult } from "./load";

/**
 * Gate review container logic, extracted from the page so the decision flow
 * is testable without a DOM. Reject requires a note — the pipeline's rework
 * path (re-model / re-expand) attaches it; approve may carry an optional one.
 */

/** A reject without feedback would lose the rework instruction — block it. */
export function canRejectWithNote(note: string): boolean {
  return note.trim().length > 0;
}

export async function decideReview(
  reviewId: string,
  decision: GateDecision,
  note?: string,
): Promise<LoadResult<GateReview>> {
  return loadPipeline(() => getPipelineClient().decideGate(reviewId, decision, note));
}
