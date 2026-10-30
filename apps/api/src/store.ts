/**
 * Storage for the API surface: job records and the intent library.
 *
 * Interfaces only here — the memory implementation is the in-process
 * fallback for tests and single-node deploys; a Drizzle/Postgres
 * implementation slots in behind the same interface later (spec
 * Architecture decisions).
 */

import type {
  BrandProfile,
  BuyerStage,
  IntentCategory,
  IntentRecord,
  ProductProfile,
  Scope,
} from "@intentvisible/core-schema";
import type { ExistingIntentSummary } from "@intentvisible/intent-engine";

import type { JobRecord } from "./types.js";

export interface IntentFilters {
  buyer_stage?: BuyerStage;
  intent_category?: IntentCategory;
  country?: string;
  language?: string;
}

export interface JobStore {
  saveJob(job: JobRecord): Promise<void>;
  getJob(jobId: string): Promise<JobRecord | null>;
  /** Latest job that touched a brand — the partially-complete visibility read. */
  latestJobForBrand(brandId: string): Promise<JobRecord | null>;
  latestJobForProduct(productId: string): Promise<JobRecord | null>;
}

export interface LibraryStore {
  saveBrandProfile(profile: BrandProfile): Promise<void>;
  saveProductProfile(profile: ProductProfile): Promise<void>;
  getBrandProfile(brandId: string): Promise<BrandProfile | null>;
  getProductProfile(productId: string): Promise<ProductProfile | null>;
  /** Persists records; they are deduped by intent_id, highest version wins. */
  saveIntents(records: readonly IntentRecord[], productId?: string): Promise<void>;
  listBrandIntents(brandId: string, filters?: IntentFilters): Promise<IntentRecord[]>;
  listProductIntents(productId: string, filters?: IntentFilters): Promise<IntentRecord[]>;
  /** The dedup view for one brand's library (spec: re-runs update, not duplicate). */
  dedupSummaries(brandId: string): Promise<ExistingIntentSummary[]>;
}

/**
 * Single-node memory implementation. Intents keep the highest intent_version
 * per intent_id; product intents are additionally indexed for the product
 * read path (IntentRecord carries brand_id but not product_id).
 */
export class MemoryJobStore implements JobStore {
  private readonly jobs = new Map<string, JobRecord>();
  private readonly jobsByBrand = new Map<string, string[]>();
  private readonly jobsByProduct = new Map<string, string[]>();

  async saveJob(job: JobRecord): Promise<void> {
    this.jobs.set(job.job_id, { ...job, status_history: [...job.status_history] });
    // Indexed from the extraction-time ids, so a brand is visible while
    // its job is still generating (the partially-complete read).
    if (job.brand_id) {
      pushUnique(this.jobsByBrand, job.brand_id, job.job_id);
    }
    if (job.product_id) {
      pushUnique(this.jobsByProduct, job.product_id, job.job_id);
    }
  }

  async getJob(jobId: string): Promise<JobRecord | null> {
    return cloneJob(this.jobs.get(jobId) ?? null);
  }

  async latestJobForBrand(brandId: string): Promise<JobRecord | null> {
    return this.latestFrom(this.jobsByBrand.get(brandId) ?? []);
  }

  async latestJobForProduct(productId: string): Promise<JobRecord | null> {
    return this.latestFrom(this.jobsByProduct.get(productId) ?? []);
  }

  private async latestFrom(jobIds: string[]): Promise<JobRecord | null> {
    let latest: JobRecord | null = null;
    for (const jobId of jobIds) {
      const job = this.jobs.get(jobId);
      if (job && (latest === null || job.created_at >= latest.created_at)) {
        latest = job;
      }
    }
    return cloneJob(latest);
  }
}

function cloneJob(job: JobRecord | null): JobRecord | null {
  return job ? { ...job, status_history: [...job.status_history] } : null;
}

function pushUnique(map: Map<string, string[]>, key: string, value: string): void {
  const existing = map.get(key) ?? [];
  if (!existing.includes(value)) {
    existing.push(value);
    map.set(key, existing);
  }
}

export class MemoryLibraryStore implements LibraryStore {
  private readonly brands = new Map<string, BrandProfile>();
  private readonly products = new Map<string, ProductProfile>();
  private readonly intents = new Map<string, IntentRecord>();
  private readonly intentIdsByBrand = new Map<string, string[]>();
  private readonly intentIdsByProduct = new Map<string, string[]>();

  async saveBrandProfile(profile: BrandProfile): Promise<void> {
    this.brands.set(profile.brand_id, profile);
  }

  async saveProductProfile(profile: ProductProfile): Promise<void> {
    this.products.set(profile.product_id, profile);
  }

  async getBrandProfile(brandId: string): Promise<BrandProfile | null> {
    return this.brands.get(brandId) ?? null;
  }

  async getProductProfile(productId: string): Promise<ProductProfile | null> {
    return this.products.get(productId) ?? null;
  }

  async saveIntents(records: readonly IntentRecord[], productId?: string): Promise<void> {
    for (const record of records) {
      const existing = this.intents.get(record.intent_id);
      if (!existing || record.intent_version >= existing.intent_version) {
        this.intents.set(record.intent_id, record);
        pushUnique(this.intentIdsByBrand, record.brand_id, record.intent_id);
        if (productId) {
          pushUnique(this.intentIdsByProduct, productId, record.intent_id);
        }
      }
    }
  }

  async listBrandIntents(brandId: string, filters: IntentFilters = {}): Promise<IntentRecord[]> {
    return this.listIntents(brandId, this.intentIdsByBrand.get(brandId), filters);
  }

  async listProductIntents(
    productId: string,
    filters: IntentFilters = {},
  ): Promise<IntentRecord[]> {
    return this.listIntents(undefined, this.intentIdsByProduct.get(productId), filters);
  }

  private listIntents(
    brandId: string | undefined,
    intentIds: string[] | undefined,
    filters: IntentFilters,
  ): IntentRecord[] {
    const records: IntentRecord[] = [];
    for (const intentId of intentIds ?? []) {
      const record = this.intents.get(intentId);
      if (!record) {
        continue;
      }
      if (brandId !== undefined && record.brand_id !== brandId) {
        continue;
      }
      if (filters.buyer_stage !== undefined && record.buyer_stage !== filters.buyer_stage) {
        continue;
      }
      if (
        filters.intent_category !== undefined &&
        record.intent_category !== filters.intent_category
      ) {
        continue;
      }
      if (filters.country !== undefined && record.country !== filters.country) {
        continue;
      }
      if (filters.language !== undefined && record.language !== filters.language) {
        continue;
      }
      records.push(record);
    }
    return records;
  }

  async dedupSummaries(brandId: string): Promise<ExistingIntentSummary[]> {
    const summaries: ExistingIntentSummary[] = [];
    for (const intentId of this.intentIdsByBrand.get(brandId) ?? []) {
      const record = this.intents.get(intentId);
      if (record) {
        summaries.push(summaryOfRecord(record));
      }
    }
    return summaries;
  }
}

function summaryOfRecord(record: IntentRecord): ExistingIntentSummary {
  return {
    intent_id: record.intent_id,
    scope: record.scope as Scope,
    brand_id: record.brand_id,
    country: record.country,
    language: record.language,
    intent_category: record.intent_category,
    intent_name: record.intent_name,
    intent_version: record.intent_version,
  };
}
