/**
 * Drift detection (blueprint C.2): a recurring cycle's per-intent pooled
 * visibility is compared with the baseline's; a drop of more than 10
 * percentage points on any monitored intent bumps the intent version (a
 * re-baseline of that intent), never silently — the events are recorded on
 * the cycle and the published records get the version bump.
 */

import type { MetricsSnapshot } from "@intentvisible/core-schema";

import { DRIFT_THRESHOLD_PTS, type DriftEvent } from "./types.js";

export { DRIFT_THRESHOLD_PTS };

/** Per-intent pooled visibility map (intent_id → visibility_pct). */
export function visibilityByIntent(
  pooled: ReadonlyArray<MetricsSnapshot>,
): Map<string, number> {
  return new Map(pooled.map((snapshot) => [snapshot.intent_id, snapshot.visibility_pct]));
}

/**
 * Intents whose visibility dropped by more than the threshold, sorted by
 * intent_id. Intents absent from one side (new or removed prompts) are not
 * drift — they are additions, tracked by the plan diff.
 */
export function detectDrift(
  baseline: ReadonlyMap<string, number>,
  current: ReadonlyMap<string, number>,
  threshold: number = DRIFT_THRESHOLD_PTS,
): DriftEvent[] {
  const events: DriftEvent[] = [];
  for (const intentId of [...baseline.keys()].sort()) {
    const before = baseline.get(intentId);
    const after = current.get(intentId);
    if (before === undefined || after === undefined) {
      continue;
    }
    const delta = after - before;
    if (delta <= -threshold) {
      events.push({
        intent_id: intentId,
        from_visibility_pct: before,
        to_visibility_pct: after,
        delta_pct: delta,
      });
    }
  }
  return events;
}
