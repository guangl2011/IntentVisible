import type { Clock } from "./clock.js";

/**
 * Per-domain politeness (spec Flow, Fetch row: "per-domain rate caps").
 *
 * The limiter is stateless about intervals — the caller resolves the
 * interval per request (default floor vs. robots.txt Crawl-delay) and the
 * limiter spaces requests by host. Clock is injected so tests never sleep.
 */
export class DomainRateLimiter {
  private readonly lastRequestAtMs = new Map<string, number>();

  constructor(private readonly clock: Clock) {}

  /**
   * Waits until `hostKey`'s next slot is free and marks it used. Resolves
   * with the number of milliseconds actually waited (0 for the first hit).
   */
  async acquire(hostKey: string, intervalMs: number): Promise<number> {
    const now = this.clock.nowMs();
    const last = this.lastRequestAtMs.get(hostKey);
    const waitMs = last === undefined ? 0 : Math.max(0, intervalMs - (now - last));
    if (waitMs > 0) {
      await this.clock.sleep(waitMs);
    }
    this.lastRequestAtMs.set(hostKey, this.clock.nowMs());
    return waitMs;
  }
}
