/**
 * Shared adapter plumbing for both LLM defaults: one adapter call plus
 * retry/backoff over the engine's RetryOptions budget (the same budget
 * shape the v1 generator uses — one spend policy across packages).
 */

import { LlmError, type LlmAdapter, type LlmRequest, type LlmResponse, type RetryOptions } from "@intentvisible/intent-engine";
import type { Clock } from "@intentvisible/intent-engine";

/** Backoff before retry number N (N starts at 1): base, base*2, base*4 … capped. */
export function backoffDelayMs(retry: RetryOptions, retryNumber: number): number {
  return Math.min(retry.max_delay_ms, retry.base_delay_ms * 2 ** (retryNumber - 1));
}

export interface CompleteWithRetryDeps {
  adapter: LlmAdapter;
  clock: Clock;
  retry: RetryOptions;
}

/**
 * One adapter call, retried on retryable transport errors until the budget
 * is spent. Non-retryable errors (including unparseable model output) fail
 * on the first attempt.
 */
export async function completeWithRetry(
  deps: CompleteWithRetryDeps,
  request: LlmRequest,
): Promise<LlmResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= deps.retry.max_attempts; attempt++) {
    try {
      return await deps.adapter.complete(request);
    } catch (error) {
      lastError = error;
      if (!(error instanceof LlmError) || !error.retryable || attempt === deps.retry.max_attempts) {
        throw error;
      }
      await deps.clock.sleep(backoffDelayMs(deps.retry, attempt));
    }
  }
  // The loop always returns or throws; this guards future edits to the loop body.
  throw lastError;
}
