import type { BrandProfile, ProductProfile } from "@intentvisible/core-schema";

import { extractProfiles } from "./extract/profiles.js";
import type { LandingPageProfile } from "./landing-page.js";
import { UrlFetcher } from "./fetcher.js";
import type { FetcherDeps, FetcherOptions } from "./fetcher.js";
import type { FetchFailure, PipelineFailureReason, StoredSnapshot } from "./types.js";

export type AnalyzeKind = "brand" | "product";

/** Product analysis is single-PDP: no link expansion, one page max. */
const PRODUCT_ANALYZE_OPTIONS: Partial<FetcherOptions> = {
  maxDepth: 0,
  maxPages: 1,
};

export interface AnalyzeSuccess {
  ok: true;
  brand: BrandProfile | null;
  product: ProductProfile | null;
  landing_pages: LandingPageProfile[];
  /** Every persisted snapshot, including pages extraction could not use. */
  snapshots: StoredSnapshot[];
  /** Non-fatal fetch failures; a crawl can succeed with some pages denied. */
  failures: FetchFailure[];
}

export type AnalyzeOutcome =
  | AnalyzeSuccess
  | {
      ok: false;
      reason: PipelineFailureReason;
      detail: string;
      /** Snapshots kept for diagnosis even when extraction fails (spec Flow). */
      snapshots: StoredSnapshot[];
      failures: FetchFailure[];
    };

/**
 * Pipeline facade (spec Flow rows Fetch → Extract): crawl, persist each
 * snapshot, then build evidence-cited profiles. Fetch denial on the seed
 * fails the job with a typed reason before anything is generated; an empty
 * extraction fails the job but the snapshots stay on disk for diagnosis.
 */
export class UrlExtractor {
  constructor(
    private readonly options: Partial<FetcherOptions>,
    private readonly deps: FetcherDeps,
  ) {}

  async analyzeUrl(seedUrl: string, kind: AnalyzeKind = "brand"): Promise<AnalyzeOutcome> {
    const fetcher = new UrlFetcher(
      kind === "product" ? { ...this.options, ...PRODUCT_ANALYZE_OPTIONS } : this.options,
      this.deps,
    );
    const crawl = await fetcher.crawl(seedUrl);

    const seedFailure = crawl.failures[0];
    if (crawl.snapshots.length === 0 && seedFailure) {
      return {
        ok: false,
        reason: seedFailure.reason,
        detail: seedFailure.detail,
        snapshots: [],
        failures: crawl.failures,
      };
    }

    const pages = crawl.snapshots.map((snapshot) => ({
      snapshot,
      stored: this.deps.snapshotStore.save(snapshot),
    }));
    const stored = await Promise.all(pages.map((page) => page.stored));
    const extracted = pages.map((page, index) => {
      const snapshot = crawl.snapshots[index];
      const snapshotRef = stored[index];
      if (!snapshot || !snapshotRef) {
        throw new Error("snapshot list changed while persisting");
      }
      return { snapshot, stored: snapshotRef };
    });

    const extraction = extractProfiles(extracted, this.deps.clock);
    if (!extraction.ok) {
      return {
        ok: false,
        reason: extraction.reason,
        detail: extraction.detail,
        snapshots: stored,
        failures: crawl.failures,
      };
    }
    return {
      ok: true,
      brand: extraction.brand,
      product: extraction.product,
      landing_pages: extraction.landing_pages,
      snapshots: stored,
      failures: crawl.failures,
    };
  }
}
