/**
 * Injectable clock — side effects (time, timers) live at the edges so the
 * rate limiter and fetcher stay deterministically testable.
 */
export interface Clock {
  /** Wall-clock milliseconds (monotonicity is not required by callers). */
  nowMs(): number;
  /** ISO 8601 timestamp for record fields (fetched_at, generated_at). */
  isoNow(): string;
  /** Resolves after at least the given delay. */
  sleep(ms: number): Promise<void>;
}

export class SystemClock implements Clock {
  nowMs(): number {
    return Date.now();
  }

  isoNow(): string {
    return new Date().toISOString();
  }

  sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
