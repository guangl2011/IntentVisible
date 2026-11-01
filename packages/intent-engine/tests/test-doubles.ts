/**
 * Test doubles: scripted LLM adapters (recorded-response semantics) and a
 * controllable clock. All engine tests run against these — no live key.
 */

import type { LlmAdapter, LlmErrorReason, LlmRequest, LlmResponse } from "../src/adapter.js";
import { LlmError } from "../src/adapter.js";
import type { Clock } from "../src/clock.js";

export class FakeClock implements Clock {
  readonly #sleeps: number[] = [];
  #now = 0;

  async sleep(ms: number): Promise<void> {
    this.#sleeps.push(ms);
    this.#now += ms;
  }

  isoNow(): string {
    return new Date(this.#now).toISOString();
  }

  nowMs(): number {
    return this.#now;
  }

  /** Delay sequence handed to sleep(), in order. */
  get sleeps(): readonly number[] {
    return this.#sleeps;
  }
}

/** Serves a scripted queue of model texts (or throws) in call order. */
export class ScriptedAdapter implements LlmAdapter {
  readonly requests: LlmRequest[] = [];

  constructor(
    private readonly scripted: Array<string | LlmError>,
  ) {}

  async complete(request: LlmRequest): Promise<LlmResponse> {
    const next = this.scripted.shift();
    if (next === undefined) {
      throw new Error("ScriptedAdapter ran dry — more complete() calls than scripted responses");
    }
    this.requests.push(request);
    if (next instanceof LlmError) {
      throw next;
    }
    return { text: next, model: "fixture-model" };
  }

  get remaining(): number {
    return this.scripted.length;
  }
}

/** Always fails with the given reason — for budget-exhaustion tests. */
export class FailingAdapter implements LlmAdapter {
  calls = 0;

  constructor(
    private readonly reason: LlmErrorReason,
    private readonly retryable: boolean,
  ) {}

  async complete(_request: LlmRequest): Promise<LlmResponse> {
    void _request;
    this.calls += 1;
    throw new LlmError(this.reason, `${this.reason} (scripted)`, this.retryable);
  }
}
