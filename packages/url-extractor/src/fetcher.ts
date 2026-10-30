import { DomainRateLimiter } from "./rate-limit.js";
import { HttpRobotsGate, type RobotsGate } from "./robots.js";
import { extractLinks, urlKey } from "./links.js";
import { hashHtml } from "./normalize.js";
import type { Clock } from "./clock.js";
import type { SnapshotStore } from "./snapshot.js";
import type { FetchFailure, FetchLike, FetchOutcome, PageSnapshot } from "./types.js";

/**
 * Robots-aware fetcher (spec Flow, Fetch row): robots.txt respect, Crawl-
 * delay-aware per-domain rate caps, depth and page-count limits, and a
 * snapshot of every successfully fetched page.
 */
export interface FetcherOptions {
  /** Crawl depth from the seed page (seed = depth 0). */
  maxDepth: number;
  /** Maximum pages fetched per crawl. */
  maxPages: number;
  /** Per-domain politeness floor; robots.txt Crawl-delay may raise it. */
  minRequestIntervalMs: number;
  /** Per-request abort timeout. */
  timeoutMs: number;
  userAgent: string;
}

export const DEFAULT_FETCHER_OPTIONS: FetcherOptions = {
  maxDepth: 3,
  maxPages: 25,
  minRequestIntervalMs: 1000,
  timeoutMs: 15000,
  userAgent: "IntentVisibleBot/0.1 (+https://github.com/guangl2011/IntentVisible)",
};

export interface FetcherDeps {
  clock: Clock;
  fetchImpl: FetchLike;
  snapshotStore: SnapshotStore;
}

/** Result of crawling a site section: every snapshot is already persisted. */
export interface CrawlResult {
  snapshots: PageSnapshot[];
  failures: FetchFailure[];
}

export class UrlFetcher {
  private readonly options: FetcherOptions;
  private readonly clock: Clock;
  private readonly fetchImpl: FetchLike;
  private readonly snapshotStore: SnapshotStore;
  private readonly robotsGate: RobotsGate;
  private readonly limiter: DomainRateLimiter;

  constructor(options: Partial<FetcherOptions>, deps: FetcherDeps, robotsGate?: RobotsGate) {
    this.options = { ...DEFAULT_FETCHER_OPTIONS, ...options };
    this.clock = deps.clock;
    this.fetchImpl = deps.fetchImpl;
    this.snapshotStore = deps.snapshotStore;
    this.robotsGate = robotsGate ?? new HttpRobotsGate({
      fetchImpl: deps.fetchImpl,
      timeoutMs: this.options.timeoutMs,
      userAgent: this.options.userAgent,
    });
    this.limiter = new DomainRateLimiter(deps.clock);
  }

  /** Fetches one page through the full gate: robots, rate cap, snapshot. */
  async fetchPage(url: string): Promise<FetchOutcome> {
    const decision = await this.robotsGate.check(url);
    if (!decision.allowed) {
      return {
        ok: false,
        failure: { reason: "fetch_robots_disallowed", url, detail: decision.detail },
      };
    }

    const hostKey = new URL(url).host;
    const intervalMs = Math.max(
      this.options.minRequestIntervalMs,
      (decision.crawlDelaySeconds ?? 0) * 1000,
    );
    await this.limiter.acquire(hostKey, intervalMs);

    try {
      const response = await this.fetchImpl(url, {
        signal: AbortSignal.timeout(this.options.timeoutMs),
        headers: {
          "user-agent": this.options.userAgent,
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
        redirect: "follow",
      });
      if (!response.ok) {
        return {
          ok: false,
          failure: { reason: "fetch_unreachable", url, detail: `HTTP ${response.status}` },
        };
      }
      const rawHtml = await response.text();
      const snapshot: PageSnapshot = {
        // Final URL after redirects — the evidence URL records cite.
        url: response.url || url,
        status: response.status,
        fetched_at: this.clock.isoNow(),
        content_hash: hashHtml(rawHtml),
        raw_html: rawHtml,
      };
      return { ok: true, snapshot };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      return { ok: false, failure: { reason: "fetch_unreachable", url, detail } };
    }
  }

  /**
   * Breadth-first same-host crawl from the seed, bounded by maxDepth and
   * maxPages. Failures never consume budget; the frontier is finite because
   * each URL is visited once.
   */
  async crawl(seedUrl: string): Promise<CrawlResult> {
    const seed = new URL(seedUrl);
    const frontier: Array<{ url: string; depth: number }> = [{ url: seed.toString(), depth: 0 }];
    const seen = new Set<string>();
    const snapshots: PageSnapshot[] = [];
    const failures: FetchFailure[] = [];

    while (frontier.length > 0 && snapshots.length < this.options.maxPages) {
      const next = frontier.shift();
      if (!next) {
        break;
      }
      const key = urlKey(next.url);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const outcome = await this.fetchPage(next.url);
      if (!outcome.ok) {
        failures.push(outcome.failure);
        continue;
      }
      snapshots.push(outcome.snapshot);

      if (next.depth >= this.options.maxDepth) {
        continue;
      }
      for (const link of extractLinks(outcome.snapshot.raw_html, outcome.snapshot.url)) {
        let linkUrl: URL;
        try {
          linkUrl = new URL(link);
        } catch {
          continue;
        }
        if (linkUrl.host !== seed.host) {
          continue;
        }
        frontier.push({ url: linkUrl.toString(), depth: next.depth + 1 });
      }
    }

    return { snapshots, failures };
  }
}
