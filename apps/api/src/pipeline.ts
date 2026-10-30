/**
 * The analyze pipeline (spec Flow rows Fetch → Extract → Generate →
 * Validate + dedup → Read), wrapped in the API's job state machine.
 * Every failure is terminal and typed: fetch denial, empty extraction,
 * and generation/LLM failure each map onto a closed reason vocabulary,
 * and nothing is generated past a denial (Flow table, Fetch row).
 */

import { randomUUID } from "node:crypto";

import type { LlmAdapter, MarketTarget } from "@intentvisible/intent-engine";
import { IntentGenerator } from "@intentvisible/intent-engine";
import type {
  AnalyzeKind,
  FetcherDeps,
  FetcherOptions,
  StoredSnapshot,
} from "@intentvisible/url-extractor";
import { UrlExtractor } from "@intentvisible/url-extractor";

import type { JobStore, LibraryStore } from "./store.js";
import type { AnalyzeQueue } from "./queue.js";
import type { JobRecord, JobFailureReason } from "./types.js";

export const DEFAULT_MARKETS: readonly MarketTarget[] = [{ country: "AU", language: "en" }];

export interface PipelineDeps {
  jobStore: JobStore;
  libraryStore: LibraryStore;
  queue: AnalyzeQueue;
  /** Clock + fetch + snapshot storage — the extractor's injectable edges. */
  extractorDeps: FetcherDeps;
  fetcherOptions?: Partial<FetcherOptions>;
  llmAdapter: LlmAdapter;
  markets?: readonly MarketTarget[];
  maxCandidatesPerMarket?: number;
  log?: (event: string) => void;
}

export class AnalyzePipeline {
  private readonly jobStore: JobStore;
  private readonly libraryStore: LibraryStore;
  private readonly queue: AnalyzeQueue;
  private readonly extractor: UrlExtractor;
  private readonly generator: IntentGenerator;
  private readonly markets: readonly MarketTarget[];
  private readonly maxCandidatesPerMarket: number | undefined;
  private readonly log: (event: string) => void;

  constructor(deps: PipelineDeps) {
    this.jobStore = deps.jobStore;
    this.libraryStore = deps.libraryStore;
    this.queue = deps.queue;
    this.extractor = new UrlExtractor(deps.fetcherOptions ?? {}, deps.extractorDeps);
    this.generator = new IntentGenerator({
      adapter: deps.llmAdapter,
      clock: deps.extractorDeps.clock,
      log: deps.log,
    });
    this.markets = deps.markets ?? DEFAULT_MARKETS;
    this.maxCandidatesPerMarket = deps.maxCandidatesPerMarket;
    this.log = deps.log ?? ((_event: string) => {});
  }

  /**
   * Creates the job record in `queued` state and hands the run closure to
   * the queue. Returns immediately — the analyze endpoints never block on
   * fetching (spec API table: returns { job_id } immediately).
   */
  async createJob(kind: AnalyzeKind, url: string, requestedBrandId?: string): Promise<JobRecord> {
    const now = new Date().toISOString();
    const job: JobRecord = {
      job_id: `job_${randomUUID()}`,
      kind,
      url,
      ...(requestedBrandId !== undefined ? { requested_brand_id: requestedBrandId } : {}),
      status: "queued",
      status_history: [{ status: "queued", at: now }],
      error: null,
      result: null,
      created_at: now,
      updated_at: now,
    };
    await this.jobStore.saveJob(job);
    this.queue.enqueue(() => this.run(job.job_id));
    return ensureJob(await this.loadJob(job.job_id), job.job_id);
  }

  private async run(jobId: string): Promise<void> {
    try {
      await this.execute(jobId);
    } catch (error) {
      // Backstop: the closed failure reasons above cover the pipeline
      // packages' typed failures; anything else is an internal bug and
      // must still terminate the job rather than hang it.
      const detail = error instanceof Error ? error.message : String(error);
      await this.fail(jobId, "internal_error", detail);
    }
  }

  private async execute(jobId: string): Promise<void> {
    const job = await this.loadJob(jobId);
    if (!job) {
      throw new Error(`job ${jobId} disappeared before execution`);
    }

    // ── Fetch (+ extract inside the extractor facade) ──
    await this.transition(job, "fetching");
    const extraction = await this.extractor.analyzeUrl(job.url, job.kind);

    if (!extraction.ok) {
      await this.fail(jobId, extraction.reason, extraction.detail);
      return;
    }
    await this.transition(ensureJob(await this.loadJob(jobId), jobId), "extracting");

    if (!extraction.brand && !extraction.product) {
      // The snapshots stay on disk for diagnosis (Flow, Extract row).
      await this.fail(
        jobId,
        "extraction_empty",
        "neither a brand nor a product profile could be extracted from the fetched pages",
      );
      return;
    }

    const target = job.kind === "brand" ? extraction.brand : extraction.product;
    if (!target) {
      await this.fail(
        jobId,
        "extraction_empty",
        job.kind === "brand"
          ? "no brand profile could be extracted from the fetched pages"
          : "no product profile could be extracted from the fetched pages",
      );
      return;
    }

    if (extraction.brand) {
      await this.libraryStore.saveBrandProfile(extraction.brand);
    }
    if (extraction.product) {
      await this.libraryStore.saveProductProfile(extraction.product);
    }

    // Stamp the ids before generation: the read endpoints index jobs by
    // these, so the partially-complete read works while generating.
    const stamped = ensureJob(await this.loadJob(jobId), jobId);
    if (extraction.brand) {
      stamped.brand_id = extraction.brand.brand_id;
    }
    if (extraction.product) {
      stamped.product_id = extraction.product.product_id;
    }
    await this.jobStore.saveJob(stamped);

    // ── Generate ──
    const brandId = extraction.brand?.brand_id ?? extraction.product!.brand_id;
    const productId = extraction.product?.product_id;
    const snapshots: readonly StoredSnapshot[] = extraction.snapshots;
    await this.transition(ensureJob(await this.loadJob(jobId), jobId), "generating");
    const outcome =
      job.kind === "brand"
        ? await this.generator.generateBrandIntents(extraction.brand!, {
            markets: [...this.markets],
            snapshots,
            existing: await this.libraryStore.dedupSummaries(brandId),
            ...(this.maxCandidatesPerMarket !== undefined
              ? { max_candidates_per_market: this.maxCandidatesPerMarket }
              : {}),
          })
        : await this.generator.generateProductIntents(extraction.product!, {
            markets: [...this.markets],
            snapshots,
            existing: await this.libraryStore.dedupSummaries(brandId),
            ...(this.maxCandidatesPerMarket !== undefined
              ? { max_candidates_per_market: this.maxCandidatesPerMarket }
              : {}),
          });

    if (!outcome.ok) {
      await this.fail(jobId, outcome.reason, outcome.detail);
      return;
    }

    // ── Validate + dedup (done inside the generator) → persist ──
    await this.transition(ensureJob(await this.loadJob(jobId), jobId), "validating");
    await this.libraryStore.saveIntents(
      outcome.records,
      job.kind === "product" ? productId : undefined,
    );

    const complete = ensureJob(await this.loadJob(jobId), jobId);
    complete.status = "complete";
    complete.status_history.push({ status: "complete", at: new Date().toISOString() });
    complete.updated_at = new Date().toISOString();
    complete.result = {
      ...(extraction.brand ? { brand_id: extraction.brand.brand_id } : {}),
      ...(extraction.product ? { product_id: extraction.product.product_id } : {}),
      intents_created: outcome.records.length,
    };
    await this.jobStore.saveJob(complete);
  }

  private async transition(job: JobRecord, status: JobRecord["status"]): Promise<void> {
    job.status = status;
    job.status_history.push({ status, at: new Date().toISOString() });
    job.updated_at = new Date().toISOString();
    await this.jobStore.saveJob(job);
  }

  private async fail(jobId: string, reason: JobFailureReason, detail: string): Promise<void> {
    const job = ensureJob(await this.loadJob(jobId), jobId);
    job.status = "failed";
    job.status_history.push({ status: "failed", at: new Date().toISOString() });
    job.updated_at = new Date().toISOString();
    job.error = { reason, detail };
    await this.jobStore.saveJob(job);
  }

  private async loadJob(jobId: string): Promise<JobRecord | null> {
    return this.jobStore.getJob(jobId);
  }
}

function ensureJob(job: JobRecord | null, jobId: string): JobRecord {
  if (!job) {
    throw new Error(`job ${jobId} disappeared mid-execution`);
  }
  return job;
}
