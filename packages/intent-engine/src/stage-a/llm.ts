/**
 * The retry-wrapped LLM completion for Stage A modeling passes, mirroring
 * the v1 engine's generate loop: transport errors retry per their
 * retryable flag with the shared backoff curve, envelope-level output
 * errors (ModelOutputError) retry because a fresh attempt may produce
 * parseable JSON. After the budget: transport exhaustion surfaces as a
 * typed Stage A failure with reason llm_unavailable, output exhaustion as
 * llm_invalid_output. ModelOutputError is intentionally in this package —
 * it names the Stage A contract, not the adapter's.
 */

import type { Clock } from "../clock.js";
import { LlmError, type LlmAdapter, type LlmRequest } from "../adapter.js";
import { type RetryOptions } from "../generate.js";

export class ModelOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelOutputError";
  }
}

export interface StageAFailureShape {
  reason: "llm_unavailable" | "llm_invalid_output";
  detail: string;
}

export class StageAFailure extends Error {
  readonly reason: StageAFailureShape["reason"];

  constructor(reason: StageAFailureShape["reason"], detail: string) {
    super(`${reason}: ${detail}`);
    this.name = "StageAFailure";
    this.reason = reason;
    this.detail = detail;
  }

  readonly detail: string;
}

/**
 * Completes one LLM call and parses it, retrying on transport errors and
 * on ModelOutputError until the retry budget is spent, with the same
 * backoff curve as the v1 generator (base doubling, capped). Throws
 * LlmError (non-retryable transport) or StageAFailure on exhaustion.
 */
export async function completeAndParse<T>(
  deps: { adapter: LlmAdapter; clock: Clock; retry: RetryOptions },
  request: LlmRequest,
  parse: (text: string) => T,
): Promise<{ response: Awaited<ReturnType<LlmAdapter["complete"]>>; parsed: T }> {
  let lastFailure: StageAFailure | undefined;
  for (let attempt = 1; attempt <= deps.retry.max_attempts; attempt += 1) {
    try {
      const response = await deps.adapter.complete(request);
      return { response, parsed: parse(response.text) };
    } catch (error) {
      if (error instanceof ModelOutputError) {
        lastFailure = new StageAFailure("llm_invalid_output", error.message);
        if (attempt < deps.retry.max_attempts) {
          await deps.clock.sleep(backoffDelayMs(deps.retry, attempt));
          continue;
        }
        break;
      }
      if (error instanceof LlmError) {
        if (error.retryable && attempt < deps.retry.max_attempts) {
          await deps.clock.sleep(backoffDelayMs(deps.retry, attempt));
          continue;
        }
        if (!error.retryable) {
          throw new StageAFailure("llm_unavailable", error.message);
        }
        lastFailure = new StageAFailure("llm_unavailable", error.message);
        break;
      }
      throw error;
    }
  }
  throw (
    lastFailure ??
    new StageAFailure("llm_invalid_output", "the model produced no usable output")
  );
}

/** Same backoff curve as the v1 generator: base doubling, capped at max_delay_ms. */
function backoffDelayMs(retry: RetryOptions, attempt: number): number {
  return Math.min(retry.max_delay_ms, retry.base_delay_ms * 2 ** (attempt - 1));
}

export type { RetryOptions };
