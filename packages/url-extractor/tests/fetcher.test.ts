import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { UrlFetcher } from "../src/fetcher.js";
import { LocalFileSnapshotStore } from "../src/snapshot.js";
import type { FetcherOptions } from "../src/fetcher.js";
import type { FetchLike } from "../src/types.js";

import { FakeClock, startFixtureServer, type FixtureServer } from "./helpers.js";

const ROBOTS_ALLOW_ALL = "User-agent: *\nAllow: /\n";
const ROBOTS_WITH_PRIVATE = "User-agent: *\nDisallow: /private/\n";

function page(links: string[] = []): string {
  const anchors = links.map((href) => `<a href="${href}">link</a>`).join("");
  return `<!doctype html><html><head><title>fixture</title></head><body>${anchors}<p>page</p></body></html>`;
}

describe("UrlFetcher", () => {
  let server: FixtureServer;
  let store: LocalFileSnapshotStore;

  beforeEach(async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "url-extractor-fetch-"));
    store = new LocalFileSnapshotStore(rootDir);
  });
  afterEach(async () => {
    await server?.close();
  });

  function makeFetcher(
    options: Partial<FetcherOptions>,
    clock: FakeClock = new FakeClock(),
  ): { fetcher: UrlFetcher; clock: FakeClock } {
    const fetcher = new UrlFetcher(
      { minRequestIntervalMs: 0, timeoutMs: 2000, ...options },
      { clock, fetchImpl: fetch, snapshotStore: store },
    );
    return { fetcher, clock };
  }

  it("fetches a page and produces a snapshot with content_hash and fetched_at", async () => {
    server = await startFixtureServer({ "/robots.txt": ROBOTS_ALLOW_ALL, "/": page() });
    const { fetcher } = makeFetcher({});
    const outcome = await fetcher.fetchPage(`${server.baseUrl}/`);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.snapshot.status).toBe(200);
    expect(outcome.snapshot.url).toBe(`${server.baseUrl}/`);
    expect(outcome.snapshot.content_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(outcome.snapshot.fetched_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    const stored = await store.save(outcome.snapshot);
    await expect(store.read(stored.storage_ref)).resolves.toContain("fixture");
  });

  it("refuses a robots-restricted path with fetch_robots_disallowed and never requests it", async () => {
    server = await startFixtureServer({
      "/robots.txt": ROBOTS_WITH_PRIVATE,
      "/private/product": page(),
      "/open": page(),
    });
    const { fetcher } = makeFetcher({});

    const denied = await fetcher.fetchPage(`${server.baseUrl}/private/product`);
    expect(denied).toMatchObject({
      ok: false,
      failure: { reason: "fetch_robots_disallowed" },
    });
    if (!denied.ok) {
      expect(denied.failure.detail).toContain("robots.txt disallows");
    }

    const allowed = await fetcher.fetchPage(`${server.baseUrl}/open`);
    expect(allowed.ok).toBe(true);
    expect(server.requestedPaths).toEqual(["/robots.txt", "/open"]);
    expect(server.requestedPaths).not.toContain("/private/product");
  });

  it("refuses to crawl when robots.txt cannot be fetched (conservative)", async () => {
    server = await startFixtureServer({ "/robots.txt": { status: 500, body: "boom" }, "/": page() });
    const { fetcher } = makeFetcher({});

    const outcome = await fetcher.fetchPage(`${server.baseUrl}/`);
    expect(outcome).toMatchObject({ ok: false, failure: { reason: "fetch_robots_disallowed" } });
    expect(server.requestedPaths).toEqual(["/robots.txt"]);
  });

  it("treats robots.txt 404 as full allow", async () => {
    server = await startFixtureServer({ "/": page() });
    const { fetcher } = makeFetcher({});

    const outcome = await fetcher.fetchPage(`${server.baseUrl}/`);
    expect(outcome.ok).toBe(true);
  });

  it("maps HTTP errors and network failures to fetch_unreachable", async () => {
    server = await startFixtureServer({
      "/robots.txt": ROBOTS_ALLOW_ALL,
      "/gone": { status: 500, body: "boom" },
      "/notfound": { status: 404, body: "nope" },
    });
    const { fetcher } = makeFetcher({});

    const serverError = await fetcher.fetchPage(`${server.baseUrl}/gone`);
    expect(serverError).toMatchObject({
      ok: false,
      failure: { reason: "fetch_unreachable", detail: "HTTP 500" },
    });

    const notFound = await fetcher.fetchPage(`${server.baseUrl}/notfound`);
    expect(notFound).toMatchObject({
      ok: false,
      failure: { reason: "fetch_unreachable", detail: "HTTP 404" },
    });

    const throwingFetch: FetchLike = async (url) => {
      if (String(url).endsWith("/robots.txt")) {
        return new Response(ROBOTS_ALLOW_ALL, { status: 200 });
      }
      throw new TypeError("fetch failed");
    };
    const networkFetcher = new UrlFetcher(
      { minRequestIntervalMs: 0 },
      { clock: new FakeClock(), fetchImpl: throwingFetch, snapshotStore: store },
    );
    const networkError = await networkFetcher.fetchPage("https://fixture.invalid/products/x");
    expect(networkError).toMatchObject({
      ok: false,
      failure: { reason: "fetch_unreachable", detail: "fetch failed" },
    });
  });

  it("spaces same-host requests by the per-domain interval", async () => {
    server = await startFixtureServer({
      "/robots.txt": ROBOTS_ALLOW_ALL,
      "/one": page(),
      "/two": page(),
      "/three": page(),
    });
    const clock = new FakeClock();
    const { fetcher } = makeFetcher({ minRequestIntervalMs: 1000 }, clock);

    await fetcher.fetchPage(`${server.baseUrl}/one`);
    await fetcher.fetchPage(`${server.baseUrl}/two`);
    await fetcher.fetchPage(`${server.baseUrl}/three`);

    // First hit waits 0. The fake clock only advances on sleep, so each
    // subsequent request waits exactly one interval — asserting the floor
    // holds between consecutive same-host fetches.
    expect(clock.sleptMs).toEqual([1000, 1000]);
  });

  it("raises the interval to the robots.txt Crawl-delay when present", async () => {
    server = await startFixtureServer({
      "/robots.txt": "User-agent: *\nAllow: /\nCrawl-delay: 2\n",
      "/one": page(),
      "/two": page(),
    });
    const clock = new FakeClock();
    const { fetcher } = makeFetcher({ minRequestIntervalMs: 100 }, clock);

    await fetcher.fetchPage(`${server.baseUrl}/one`);
    await fetcher.fetchPage(`${server.baseUrl}/two`);
    expect(clock.sleptMs).toEqual([2000]);
  });

  it("crawls same-host links bounded by maxDepth and maxPages", async () => {
    server = await startFixtureServer({
      "/robots.txt": ROBOTS_ALLOW_ALL,
      "/": page(["/a", "/b", "/c", "https://external.invalid/x"]),
      "/a": page(["/a1"]),
      "/b": page(),
      "/c": page(),
      "/a1": page(),
    });

    // maxDepth=1 keeps /a1 (depth 2) out; maxPages=2 keeps /b and /c out.
    const strict = makeFetcher({ maxDepth: 1, maxPages: 2 }).fetcher;
    const bounded = await strict.crawl(`${server.baseUrl}/`);
    expect(bounded.snapshots.map((s) => s.url)).toEqual([
      `${server.baseUrl}/`,
      `${server.baseUrl}/a`,
    ]);
    expect(bounded.failures).toEqual([]);

    const loose = makeFetcher({ maxDepth: 2, maxPages: 5 }).fetcher;
    const unbounded = await loose.crawl(`${server.baseUrl}/`);
    expect(unbounded.snapshots.map((s) => s.url)).toEqual([
      `${server.baseUrl}/`,
      `${server.baseUrl}/a`,
      `${server.baseUrl}/b`,
      `${server.baseUrl}/c`,
      `${server.baseUrl}/a1`,
    ]);
  });

  it("does not let fetch failures consume the page budget", async () => {
    server = await startFixtureServer({
      "/robots.txt": ROBOTS_ALLOW_ALL,
      "/": page(["/dead", "/alive"]),
      "/dead": { status: 500, body: "boom" },
      "/alive": page(),
    });
    const { fetcher } = makeFetcher({});

    const result = await fetcher.crawl(`${server.baseUrl}/`);
    expect(result.snapshots.map((s) => new URL(s.url).pathname)).toEqual(["/", "/alive"]);
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.reason).toBe("fetch_unreachable");
  });
});
