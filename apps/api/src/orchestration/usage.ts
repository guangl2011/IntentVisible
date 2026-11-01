/**
 * Per-project monthly LLM usage accounting (blueprint C.4: a hard cap with
 * a visible pause, never silent coverage loss). Everything the orchestrator
 * sends through an LLM goes through a counting adapter that appends to a
 * ledger keyed by project + calendar month; the recurring-cycle runner
 * checks the ledger before each cycle and mid-cycle via the counting
 * adapter, so a cap stops the work instead of overspending it.
 */

import type { LlmAdapter, LlmRequest, LlmResponse } from "@intentvisible/intent-engine";

import type { PipelineStore } from "./store.js";

/** Calendar month key for the ledger, e.g. "2026-11". */
export function monthKeyOf(isoTimestamp: string): string {
  return isoTimestamp.slice(0, 7);
}

export class UsageCapExceeded extends Error {
  readonly reason = "usage_cap_reached" as const;

  constructor(
    readonly projectId: string,
    readonly monthKey: string,
    readonly used: number,
    readonly cap: number,
  ) {
    super(
      `project ${projectId} hit its monthly LLM usage cap for ${monthKey}: ${used} of ${cap} requests — monitoring paused, not skipped`,
    );
    this.name = "UsageCapExceeded";
  }
}

/** Wraps an LlmAdapter so every call is charged to the project's ledger. A
 * non-null cap is enforced BEFORE each call — mid-cycle overspend is
 * impossible; the cap stops the work instead of exceeding it. */
export function countingAdapter(
  adapter: LlmAdapter,
  projectId: string,
  store: PipelineStore,
  clock: { isoNow(): string },
  cap: number | null = null,
): LlmAdapter {
  return {
    async complete(request: LlmRequest): Promise<LlmResponse> {
      if (cap !== null) {
        await assertWithinUsageCap(store, projectId, cap, clock.isoNow());
      }
      const response = await adapter.complete(request);
      await store.addUsage(projectId, monthKeyOf(clock.isoNow()), 1);
      return response;
    },
  };
}

/** Ledger check against a project's cap; throws UsageCapExceeded when over. */
export async function assertWithinUsageCap(
  store: PipelineStore,
  projectId: string,
  cap: number | null,
  nowIso: string,
): Promise<void> {
  if (cap === null) {
    return;
  }
  const used = await store.getUsage(projectId, monthKeyOf(nowIso));
  if (used >= cap) {
    throw new UsageCapExceeded(projectId, monthKeyOf(nowIso), used, cap);
  }
}
