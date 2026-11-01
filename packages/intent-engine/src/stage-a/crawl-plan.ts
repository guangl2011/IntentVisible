/**
 * The Stage A crawl plan (blueprint Stage A: "a thin crawl-plan pass
 * decides which pages matter (product, pricing, comparison, FAQ) and caps
 * pages per crawl"). A priority-page walk over the installed site that
 * reuses the url-extractor fetcher — robots-aware, domain-bounded,
 * content-hashed snapshots — and enforces the page cap from project
 * config: 50 default, 100 with the weekly-iteration opt-in. The page
 * after the cap is never fetched (Verification #1).
 *
 * Failures are typed values, never exceptions: a robots-denied or
 * unreachable seed fails the walk; secondary-page denials are recorded
 * and the walk continues; anything that would leave the installed domain
 * (a redirect off-host) is refused outright.
 */

import {
  extractLinks,
  urlKey,
  type FetchFailure,
  type PageSnapshot,
  type SnapshotStore,
  type StoredSnapshot,
  type UrlFetcher,
} from "@intentvisible/url-extractor";

import type { Clock } from "../clock.js";

/** Page caps (blueprint decision #2): 50 default, 100 maximum. */
export const CRAWL_PAGE_CAP_DEFAULT = 50;
export const CRAWL_PAGE_CAP_WEEKLY = 100;
export const MAX_CRAWL_PAGE_CAP = CRAWL_PAGE_CAP_WEEKLY;

/**
 * Priority classes in walk order. Home is the seed; pricing and comparison
 * pages follow because Stage A.1 grounds the value proposition and the
 * competitor set in them; the product catalog is high-signal but
 * high-count — a catalog-first order would spend the whole cap on PDPs
 * before any pricing or comparison page was seen.
 */
export const PAGE_PRIORITY_CLASSES = [
  "home",
  "pricing",
  "comparison",
  "product",
  "faq",
  "about",
  "other",
] as const;
export type PagePriorityClass = (typeof PAGE_PRIORITY_CLASSES)[number];

const PRIORITY_PATTERNS: ReadonlyArray<readonly [Exclude<PagePriorityClass, "home">, RegExp]> = [
  ["pricing", /\/(pricing|prices|plans|subscriptions?)(\/|$)/i],
  ["comparison", /(-vs-|-vs\b|\/vs(\/|$)|compare|comparison|versus)/i],
  ["product", /\/(products?|collections?|shop|catalog|catalogue|store|buy)(\/|$)/i],
  ["faq", /\/(faq|faqs|questions|help|support)(\/|$)/i],
  ["about", /\/about(\/|$)/i],
];

/** Priority class of one candidate URL (home = the seed itself). */
export function classifyPagePriority(url: string, seedUrl: string): PagePriorityClass {
  if (urlKey(url) === urlKey(seedUrl)) {
    return "home";
  }
  const path = new URL(url).pathname;
  for (const [priorityClass, pattern] of PRIORITY_PATTERNS) {
    if (pattern.test(path)) {
      return priorityClass;
    }
  }
  return "other";
}

/** Project-config inputs the crawl cap derives from (caps are per-project). */
export interface CrawlCapConfig {
  /** Explicit page-cap override; must respect the weekly unlock when set. */
  crawl_page_cap?: number;
  /** Weekly-iteration opt-in — unlocks the deeper 100-page cap. */
  weekly_iteration?: boolean;
}

/**
 * Resolves the crawl cap from project config. A cap above 50 without the
 * weekly opt-in is refused — the deeper crawl is exactly what the weekly
 * cadence unlocks (blueprint decision #2).
 */
export function resolveCrawlCap(config: CrawlCapConfig): number {
  const weekly = config.weekly_iteration === true;
  const cap = config.crawl_page_cap ?? (weekly ? CRAWL_PAGE_CAP_WEEKLY : CRAWL_PAGE_CAP_DEFAULT);
  const maxCap = weekly ? MAX_CRAWL_PAGE_CAP : CRAWL_PAGE_CAP_DEFAULT;
  if (!Number.isInteger(cap) || cap < 1 || cap > maxCap) {
    throw new TypeError(
      `crawl_page_cap must be an integer in [1, ${maxCap}] (${weekly ? "weekly-iteration" : "default"} crawl); got ${String(config.crawl_page_cap)}`,
    );
  }
  return cap;
}

export const CRAWL_FAILURE_REASONS = [
  "crawl_robots_blocked",
  "crawl_unreachable",
  "domain_violation",
] as const;
export type CrawlFailureReason = (typeof CRAWL_FAILURE_REASONS)[number];

export interface CrawlPlanFailure {
  reason: CrawlFailureReason;
  url: string;
  detail: string;
}

export interface CrawledPage {
  snapshot: PageSnapshot;
  stored: StoredSnapshot;
}

export type CrawlPlanOutcome =
  | { ok: true; pages: CrawledPage[]; failures: CrawlPlanFailure[] }
  | { ok: false; reason: CrawlFailureReason; detail: string; failures: CrawlPlanFailure[] };

export interface CrawlPlanInput {
  /** The installed site's home URL — the crawl seed AND the domain bound. */
  siteUrl: string;
  /** Page cap from resolveCrawlCap — the (cap+1)-th page is never fetched. */
  cap: number;
}

export interface CrawlPlanDeps {
  /** The v1 robots-aware fetcher, one page at a time; the plan owns the cap. */
  fetcher: Pick<UrlFetcher, "fetchPage">;
  snapshotStore: SnapshotStore;
  clock: Clock;
}

function toCrawlFailure(failure: FetchFailure): CrawlPlanFailure {
  return {
    reason:
      failure.reason === "fetch_robots_disallowed" ? "crawl_robots_blocked" : "crawl_unreachable",
    url: failure.url,
    detail: failure.detail,
  };
}

/** Frontier entry: priority-class rank first, then URL ascending — a total, stable order. */
interface FrontierEntry {
  priority: PagePriorityClass;
  url: string;
}

function frontierLess(a: FrontierEntry, b: FrontierEntry): boolean {
  const aRank = PAGE_PRIORITY_CLASSES.indexOf(a.priority);
  const bRank = PAGE_PRIORITY_CLASSES.indexOf(b.priority);
  return aRank < bRank || (aRank === bRank && a.url < b.url);
}

/**
 * Walks the installed site in priority order. The seed is mandatory: a
 * robots denial or unreachable home fails the walk; every later page that
 * cannot be fetched (or that redirects off the installed host) is recorded
 * as a typed failure and skipped. Snapshots are persisted as they land.
 */
export async function executeCrawlPlan(
  input: CrawlPlanInput,
  deps: CrawlPlanDeps,
): Promise<CrawlPlanOutcome> {
  let seed: URL;
  try {
    seed = new URL(input.siteUrl);
  } catch {
    throw new TypeError(`siteUrl is not a valid URL: ${input.siteUrl}`);
  }
  if (seed.protocol !== "http:" && seed.protocol !== "https:") {
    throw new TypeError(`siteUrl must be an http(s) URL; got ${seed.protocol}`);
  }
  const allowedHost = seed.host;

  const homeOutcome = await deps.fetcher.fetchPage(seed.toString());
  if (!homeOutcome.ok) {
    const failure = toCrawlFailure(homeOutcome.failure);
    return {
      ok: false,
      reason: failure.reason,
      detail: `the installed site's home page could not be fetched: ${failure.detail}`,
      failures: [failure],
    };
  }
  const home = homeOutcome.snapshot;
  if (new URL(home.url).host !== allowedHost) {
    return {
      ok: false,
      reason: "domain_violation",
      detail: `the installed site redirected from ${seed.toString()} to ${home.url}, outside the installed domain — refusing to crawl`,
      failures: [],
    };
  }

  const failures: CrawlPlanFailure[] = [];
  const pages: CrawledPage[] = [{ snapshot: home, stored: await deps.snapshotStore.save(home) }];
  const seen = new Set<string>([urlKey(seed.toString())]);

  // Priority frontier, refilled from every fetched page's links and always
  // drained in (class rank, URL) order — the walk is deterministic.
  const frontier: FrontierEntry[] = [];
  const enqueue = (rawHtml: string, baseUrl: string): void => {
    for (const link of extractLinks(rawHtml, baseUrl)) {
      const key = urlKey(link);
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      frontier.push({ priority: classifyPagePriority(link, seed.toString()), url: link });
    }
    frontier.sort((a, b) => (frontierLess(a, b) ? -1 : frontierLess(b, a) ? 1 : 0));
  };
  enqueue(home.raw_html, home.url);

  while (pages.length < input.cap && frontier.length > 0) {
    const next = frontier.shift();
    if (!next) {
      break;
    }
    // Defense in depth: extractLinks bounds discovery to the seed host, so
    // a cross-host URL here means a boundary change — record it, never fetch.
    if (new URL(next.url).host !== allowedHost) {
      failures.push({
        reason: "domain_violation",
        url: next.url,
        detail: "a link left the installed domain; it was not fetched",
      });
      continue;
    }
    const outcome = await deps.fetcher.fetchPage(next.url);
    if (!outcome.ok) {
      // Non-fatal: failures never consume crawl budget (v1 fetcher rule).
      failures.push(toCrawlFailure(outcome.failure));
      continue;
    }
    if (new URL(outcome.snapshot.url).host !== allowedHost) {
      failures.push({
        reason: "domain_violation",
        url: next.url,
        detail: `redirected to ${outcome.snapshot.url}, outside the installed domain; not stored`,
      });
      continue;
    }
    pages.push({
      snapshot: outcome.snapshot,
      stored: await deps.snapshotStore.save(outcome.snapshot),
    });
    enqueue(outcome.snapshot.raw_html, outcome.snapshot.url);
  }

  return { ok: true, pages, failures };
}
