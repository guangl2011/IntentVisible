/**
 * API integration tests (spec acceptance rows: API job lifecycle, evidence
 * traceability, standalone-mode invariant). The queue is real (InProcessQueue),
 * the fetcher and LLM adapter are fakes at their injectable seams, and every
 * assertion runs against HTTP responses via app.inject.
 */

import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { LlmError, type LlmAdapter } from "@intentvisible/intent-engine";
import { LocalFileSnapshotStore } from "@intentvisible/url-extractor";
import type { Clock, FetcherDeps } from "@intentvisible/url-extractor";

import {
  AnalyzePipeline,
  InProcessQueue,
  MemoryJobStore,
  MemoryLibraryStore,
  buildApp,
  type JobRecord,
} from "./index.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const BRAND_URL = "https://acme.test/";
const PRODUCT_URL = "https://acme.test/products/freeze-40";
const BLOCKED_URL = "https://blocked.test/";
const DOWN_URL = "https://down.test/";
const EMPTY_URL = "https://empty.test/";

const BRAND_HTML = `<html><head><title>Acme Power</title></head><body>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "Acme Power",
  description: "Portable power stations for the outdoors",
})}</script></body></html>`;

const PRODUCT_HTML = `<html><head><title>Freeze 40</title></head><body>
<script type="application/ld+json">${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "Product",
  name: "Freeze 40",
  brand: { "@type": "Brand", name: "Acme Power" },
  description: "Portable fridge freezer for camping",
  offers: { "@type": "Offer", price: 899, priceCurrency: "AUD" },
})}</script></body></html>`;

const EMPTY_HTML = "<html><body></body></html>";

/** Valid candidate citing only the snapshot URL — passes engine validation. */
function candidatesFor(evidenceUrl: string): string {
  return JSON.stringify([
    {
      intent_name: "Camping fridge runtime questions",
      topic: "camping fridge runtime",
      buyer_stage: "Solution Research",
      intent_category: "Technical",
      persona: "Camper/Overlander",
      prompts: ["Which portable power station can run a camping fridge overnight?"],
      recommended_content: "Runtime guide with appliance assumptions",
      recommended_cta: "Check compatible models",
      evidence_urls: [evidenceUrl],
      confidence: "high",
    },
  ]);
}

/** Cites exactly the evidence the run's prompt supplied — the contract the engine enforces. */
function evidenceAwareAdapter(model = "test-model"): LlmAdapter {
  return {
    complete: async (request) => {
      const supplied = [...request.user.matchAll(/https?:\/\/[^\s)\]"']+/g)].map((match) => match[0]);
      const evidenceUrl = supplied[supplied.length - 1] ?? "https://missing-evidence.test/";
      return { text: candidatesFor(evidenceUrl), model };
    },
  };
}

function okResponse(html: string): Response {
  return new Response(html, { status: 200, headers: { "content-type": "text/html" } });
}

type FetchLike = FetcherDeps["fetchImpl"];

const ALLOW_ROBOTS = "User-agent: *\nAllow: /";

function makeFetch(): FetchLike {
  return async (url) => {
    if (url.endsWith("/robots.txt")) {
      if (url === "https://blocked.test/robots.txt") {
        return okResponse("User-agent: *\nDisallow: /");
      }
      return okResponse(ALLOW_ROBOTS);
    }
    if (url === BRAND_URL) {
      return okResponse(BRAND_HTML);
    }
    if (url === PRODUCT_URL) {
      return okResponse(PRODUCT_HTML);
    }
    if (url === EMPTY_URL) {
      return okResponse(EMPTY_HTML);
    }
    // down.test: robots allow, but the page itself is unreachable.
    throw new Error(`connect ECONNREFUSED ${new URL(url).host}`);
  };
}

const adapter: LlmAdapter = evidenceAwareAdapter();

const clock: Clock = {
  nowMs: () => Date.now(),
  isoNow: () => new Date().toISOString(),
  // No real waiting in tests: backoff and rate limits collapse to yields.
  sleep: async () => {},
};

interface Harness {
  app: FastifyInstance;
  queue: InProcessQueue;
  jobStore: MemoryJobStore;
  libraryStore: MemoryLibraryStore;
}

async function makeHarness(options?: {
  fetchImpl?: FetchLike;
  llmAdapter?: LlmAdapter;
}): Promise<Harness> {
  const snapshotStore = new LocalFileSnapshotStore(
    join(await mkdtemp(join(tmpdir(), "api-snapshots-")), "snapshots"),
  );
  const jobStore = new MemoryJobStore();
  const libraryStore = new MemoryLibraryStore();
  const queue = new InProcessQueue(1);
  const pipeline = new AnalyzePipeline({
    jobStore,
    libraryStore,
    queue,
    extractorDeps: {
      clock,
      fetchImpl: options?.fetchImpl ?? makeFetch(),
      snapshotStore,
    },
    fetcherOptions: { minRequestIntervalMs: 0, timeoutMs: 1000, maxPages: 2 },
    llmAdapter: options?.llmAdapter ?? adapter,
  });
  const app = buildApp({ pipeline, jobStore, libraryStore });
  return { app, queue, jobStore, libraryStore };
}

async function postAnalyze(
  app: FastifyInstance,
  path: string,
  body: Record<string, unknown>,
): Promise<{ statusCode: number; json: Record<string, unknown> }> {
  const response = await app.inject({ method: "POST", url: path, payload: body });
  return { statusCode: response.statusCode, json: response.json() as Record<string, unknown> };
}

// ── Tests ───────────────────────────────────────────────────────────────────

describe("POST /v1/brands/analyze", () => {
  it("returns { job_id } immediately and runs queued → complete", async () => {
    const { app, queue } = await makeHarness();

    const { statusCode, json } = await postAnalyze(app, "/v1/brands/analyze", { url: BRAND_URL });
    expect(statusCode).toBe(202);
    const jobId = json.job_id as string;
    expect(jobId).toMatch(/^job_/);

    // Immediate return: the job exists and the state machine has started
    // from queued — assert the record is readable right after the POST.
    const initial = await app.inject({ method: "GET", url: `/v1/jobs/${jobId}` });
    const initialJob = initial.json() as JobRecord;
    expect(["queued", "fetching", "extracting", "generating", "validating", "complete"]).toContain(
      initialJob.status,
    );

    await queue.drain();

    const final = await app.inject({ method: "GET", url: `/v1/jobs/${jobId}` });
    expect(final.statusCode).toBe(200);
    const job = final.json() as JobRecord;
    expect(job.status).toBe("complete");
    expect(job.result?.brand_id).toBe("brand_acme_test");
    expect(job.result?.intents_created).toBeGreaterThan(0);
    expect(job.error).toBeNull();
    expect(job.status_history.map((change) => change.status)).toEqual([
      "queued",
      "fetching",
      "extracting",
      "generating",
      "validating",
      "complete",
    ]);
  });

  it("fails with a typed reason on robots-disallowed domains", async () => {
    const { app, queue } = await makeHarness();
    const { json } = await postAnalyze(app, "/v1/brands/analyze", { url: BLOCKED_URL });
    const jobId = json.job_id as string;
    await queue.drain();

    const job = (await app.inject({ method: "GET", url: `/v1/jobs/${jobId}` })).json() as JobRecord;
    expect(job.status).toBe("failed");
    expect(job.error?.reason).toBe("fetch_robots_disallowed");
    expect(job.error?.detail).toContain("blocked.test");
    expect(job.result).toBeNull();
  });

  it("fails with a typed reason on unreachable domains", async () => {
    const { app, queue } = await makeHarness();
    const { json } = await postAnalyze(app, "/v1/brands/analyze", { url: DOWN_URL });
    await queue.drain();

    const job = (await app.inject({ method: "GET", url: `/v1/jobs/${json.job_id as string}` })).json() as JobRecord;
    expect(job.status).toBe("failed");
    expect(job.error?.reason).toBe("fetch_unreachable");
  });

  it("fails with a typed reason when extraction is empty", async () => {
    const { app, queue } = await makeHarness();
    const { json } = await postAnalyze(app, "/v1/brands/analyze", { url: EMPTY_URL });
    await queue.drain();

    const job = (await app.inject({ method: "GET", url: `/v1/jobs/${json.job_id as string}` })).json() as JobRecord;
    expect(job.status).toBe("failed");
    expect(job.error?.reason).toBe("extraction_empty");
  });

  it("fails with a typed reason when the LLM output never parses", async () => {
    const garbage: LlmAdapter = { complete: async () => ({ text: "no json here", model: "m" }) };
    const { app, queue } = await makeHarness({ llmAdapter: garbage });
    const { json } = await postAnalyze(app, "/v1/brands/analyze", { url: BRAND_URL });
    await queue.drain();

    const job = (await app.inject({ method: "GET", url: `/v1/jobs/${json.job_id as string}` })).json() as JobRecord;
    expect(job.status).toBe("failed");
    expect(job.error?.reason).toBe("llm_invalid_output");
  });

  it("fails with a typed reason when the LLM is unavailable", async () => {
    const downAdapter: LlmAdapter = {
      complete: async () => {
        throw new LlmError("unreachable", "connection refused", true);
      },
    };
    const { app, queue } = await makeHarness({ llmAdapter: downAdapter });
    const { json } = await postAnalyze(app, "/v1/brands/analyze", { url: BRAND_URL });
    await queue.drain();

    const job = (await app.inject({ method: "GET", url: `/v1/jobs/${json.job_id as string}` })).json() as JobRecord;
    expect(job.status).toBe("failed");
    expect(job.error?.reason).toBe("llm_unavailable");
  });

  it("rejects malformed bodies with a typed reason", async () => {
    const { app } = await makeHarness();
    const { statusCode, json } = await postAnalyze(app, "/v1/brands/analyze", { url: "not-a-url" });
    expect(statusCode).toBe(400);
    expect(json.error).toEqual({ reason: "invalid_request", detail: expect.any(String) });
  });
});

describe("POST /v1/products/analyze", () => {
  it("runs to complete and registers a readable product", async () => {
    const { app, queue } = await makeHarness();

    const { statusCode, json } = await postAnalyze(app, "/v1/products/analyze", {
      url: PRODUCT_URL,
      brand_id: "brand_acme_test",
    });
    expect(statusCode).toBe(202);
    expect(json.job_id).toMatch(/^job_/);
    await queue.drain();

    const job = (await app.inject({ method: "GET", url: `/v1/jobs/${json.job_id as string}` })).json() as JobRecord;
    expect(job.status).toBe("complete");
    expect(job.result?.product_id).toBe("product_freeze_40");
    expect(job.requested_brand_id).toBe("brand_acme_test");

    const read = await app.inject({ method: "GET", url: "/v1/products/product_freeze_40/intents" });
    expect(read.statusCode).toBe(200);
    const body = read.json() as { product_id: string; intents: Array<Record<string, unknown>> };
    expect(body.product_id).toBe("product_freeze_40");
    expect(body.intents.length).toBeGreaterThan(0);
  });
});

describe("intent reads", () => {
  it("serves brand intents with null measurement fields and applies filters", async () => {
    const { app, queue } = await makeHarness();
    await postAnalyze(app, "/v1/brands/analyze", { url: BRAND_URL });
    await queue.drain();

    const read = await app.inject({ method: "GET", url: "/v1/brands/brand_acme_test/intents" });
    expect(read.statusCode).toBe(200);
    const body = read.json() as {
      brand_id: string;
      job: JobRecord | null;
      intents: Array<Record<string, unknown>>;
    };
    expect(body.brand_id).toBe("brand_acme_test");
    expect(body.job?.status).toBe("complete");
    expect(body.intents.length).toBeGreaterThan(0);

    // Standalone-mode invariant, served as-is: the nulls ride along.
    for (const intent of body.intents) {
      expect(intent.measurement_status).toBe("not_measured");
      expect(intent.visibility_pct).toBeNull();
      expect(intent.monthly_search_volume).toBeNull();
      expect(intent.measurement_source).toBeNull();
      expect((intent.evidence_urls as string[]).length).toBeGreaterThan(0);
    }

    // Filters narrow, and every filter dimension works.
    const byCategory = await app.inject({
      method: "GET",
      url: "/v1/brands/brand_acme_test/intents?intent_category=Technical",
    });
    expect(byCategory.json< { intents: unknown[] } >().intents.length).toBe(body.intents.length);
    const byStage = await app.inject({
      method: "GET",
      url: "/v1/brands/brand_acme_test/intents?buyer_stage=Awareness",
    });
    expect(byStage.json<{ intents: unknown[] }>().intents).toEqual([]);
    const byCountry = await app.inject({
      method: "GET",
      url: "/v1/brands/brand_acme_test/intents?country=AU&language=en",
    });
    expect(byCountry.json<{ intents: unknown[] }>().intents.length).toBe(body.intents.length);
    const byOtherCountry = await app.inject({
      method: "GET",
      url: "/v1/brands/brand_acme_test/intents?country=US",
    });
    expect(byOtherCountry.json<{ intents: unknown[] }>().intents).toEqual([]);
  });

  it("rejects invalid filter values with a typed reason", async () => {
    const { app, queue } = await makeHarness();
    await postAnalyze(app, "/v1/brands/analyze", { url: BRAND_URL });
    await queue.drain();

    const read = await app.inject({
      method: "GET",
      url: "/v1/brands/brand_acme_test/intents?intent_category=Bogus",
    });
    expect(read.statusCode).toBe(400);
    expect(read.json().error.reason).toBe("invalid_request");
  });

  it("serves available intents with job state visible while generation is in flight", async () => {
    // The adapter hangs until the test releases it — the brand registers at
    // extraction, before generation, so the read is 200 with empty intents.
    let release: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const hanging: LlmAdapter = {
      complete: async (request) => {
        await gate;
        const supplied = [...request.user.matchAll(/https?:\/\/[^\s)\]"']+/g)].map((m) => m[0]);
        return { text: candidatesFor(supplied[supplied.length - 1] ?? BRAND_URL), model: "test-model" };
      },
    };
    const { app, queue } = await makeHarness({ llmAdapter: hanging });

    const { json } = await postAnalyze(app, "/v1/brands/analyze", { url: BRAND_URL });
    const jobId = json.job_id as string;

    let partial: { statusCode: number; body: { job: JobRecord; intents: unknown[] } } | undefined;
    for (let attempt = 0; attempt < 200; attempt++) {
      const read = await app.inject({ method: "GET", url: "/v1/brands/brand_acme_test/intents" });
      if (read.statusCode === 200) {
        const body = read.json() as { job: JobRecord; intents: unknown[] };
        if (body.job?.job_id === jobId && body.job.status === "generating") {
          partial = { statusCode: read.statusCode, body };
          break;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    expect(partial, "brand never became visible while generating").toBeDefined();
    expect(partial?.statusCode).toBe(200);
    expect(partial?.body.job.status).toBe("generating");
    expect(partial?.body.intents).toEqual([]);

    release?.();
    await queue.drain();

    const done = await app.inject({ method: "GET", url: "/v1/brands/brand_acme_test/intents" });
    expect(done.json<{ job: JobRecord }>().job.status).toBe("complete");
    expect(done.json<{ intents: unknown[] }>().intents.length).toBeGreaterThan(0);
  });

  it("404s unknown brand, product, job, and route ids with typed reasons", async () => {
    const { app } = await makeHarness();

    for (const url of [
      "/v1/brands/brand_nope/intents",
      "/v1/products/product_nope/intents",
      "/v1/jobs/job_nope",
    ]) {
      const read = await app.inject({ method: "GET", url });
      expect(read.statusCode, url).toBe(404);
      expect(read.json().error.reason, url).toBe("not_found");
    }
    const route = await app.inject({ method: "GET", url: "/v1/nope" });
    expect(route.statusCode).toBe(404);
    expect(route.json().error.reason).toBe("not_found");
  });
});
