/**
 * Deterministic intent generation (spec art_Aj4HcWgx, section D3): buyer
 * intents extracted from the synced catalog profiles — no LLM call, no
 * provider config, no network. It implements the same public generation
 * interface as the LLM generator (IntentGeneratorSeam) and reuses the same
 * pipeline stages behind it: dedup → buildStandaloneRecord, so records are
 * still built in exactly one place and re-runs dedupe instead of
 * duplicating.
 *
 * Field → category mapping (profile fields are the frozen contract; the
 * catalog sync populates them from the store's own data):
 *
 *   brand.categories              → Category Question (brand scope)
 *   brand.use_cases               → Scenario (brand scope)
 *   product.features              → Feature (tag/title-derived bullets)
 *   product.specifications        → Feature (option name/value entries)
 *   product.price + skus[].price  → Price (displayed price or SKU range;
 *                                   sale status needs a compare-at field
 *                                   schema v1 does not carry — deferred)
 *   product.shipping_and_returns  → Purchase Conditions
 *   product.use_cases             → Scenario (product scope)
 *
 * Every emitted record carries generation_method "deterministic_extraction",
 * the not_measured nulls (hard-set by buildStandaloneRecord, re-enforced by
 * IntentRecordSchema — a failure there throws, never silently passes), and
 * evidence_urls citing the run's snapshot registry: the storefront PDP and
 * Admin API source the sync stored. Prompts are English templates;
 * multi-language is deferred to the LLM phase. Intent names are pure
 * functions of the source entries, so identity is stable across re-runs and
 * content-keyed summaries keep versions unchanged unless content changed.
 */

import {
  SCHEMA_VERSION,
  SkuIntentMappingSchema,
  type BrandProfile,
  type GenerationMethod,
  type ProductProfile,
  type SkuIntentMapping,
} from "@intentvisible/core-schema";

import type { Clock } from "./clock.js";
import { dedupDrafts } from "./dedup.js";
import {
  DEFAULT_MAX_CANDIDATES_PER_MARKET,
  buildStandaloneRecord,
  validateMarket,
  type GenerationOutcome,
  type GenerationRun,
  type IntentGeneratorSeam,
} from "./generate.js";
import type { MarketTarget } from "./prompt.js";
import { slugify } from "./slug.js";
import type { ValidatedDraft } from "./validate.js";

/** Provenance stamped on every record this module emits. */
export const DETERMINISTIC_GENERATION_METHOD: GenerationMethod = "deterministic_extraction";

/** Record-field ceilings from the core-schema contract. */
const NAME_LIMIT = 200;
const CONTENT_LIMIT = 500;

function clipped(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit);
}

/** The identity and evidence material every derived draft shares. */
interface DraftMaterial {
  scope: "brand" | "product";
  brand_id: string;
  country: string;
  language: string;
  sku_ids: string[];
  evidence_urls: string[];
}

function draft(material: DraftMaterial, fields: {
  intent_name: string;
  topic: string;
  buyer_stage: ValidatedDraft["buyer_stage"];
  intent_category: ValidatedDraft["intent_category"];
  prompts: string[];
  recommended_content?: string;
  recommended_cta?: string;
}): ValidatedDraft {
  return {
    scope: material.scope,
    brand_id: material.brand_id,
    country: material.country,
    language: material.language,
    intent_name: clipped(fields.intent_name, NAME_LIMIT),
    topic: fields.topic,
    buyer_stage: fields.buyer_stage,
    intent_category: fields.intent_category,
    persona: undefined,
    pain_point: undefined,
    prompts: fields.prompts,
    recommended_content:
      fields.recommended_content !== undefined
        ? clipped(fields.recommended_content, CONTENT_LIMIT)
        : undefined,
    recommended_cta:
      fields.recommended_cta !== undefined ? clipped(fields.recommended_cta, NAME_LIMIT) : undefined,
    sku_ids: [...material.sku_ids],
    evidence_urls: [...material.evidence_urls],
    confidence: "high",
    generation_model: undefined,
  };
}

/**
 * Category Question — one per category the store itself declares. The
 * derivation never invents a category from product prose.
 */
function categoryQuestionDraft(category: string, material: DraftMaterial): ValidatedDraft {
  return draft(material, {
    intent_name: `What is ${category}?`,
    topic: `category_${slugify(category)}`,
    buyer_stage: "Awareness",
    intent_category: "Category Question",
    prompts: [`what is ${category}`, `${category} buying guide`],
    recommended_content: `A plain-language guide explaining what ${category} is`,
  });
}

/** Scenario — the store's own use-case language, never an invented one. */
function scenarioDraft(useCase: string, subject: string, material: DraftMaterial): ValidatedDraft {
  return draft(material, {
    intent_name: `${useCase} scenarios`,
    topic: `scenario_${slugify(useCase)}`,
    buyer_stage: "Consideration",
    intent_category: "Scenario",
    prompts: [`${subject} for ${useCase}`],
    recommended_content: `A use-case story built around ${useCase}`,
  });
}

/** Feature — one per feature bullet the catalog exposes. */
function featureDraft(feature: string, subject: string, material: DraftMaterial): ValidatedDraft {
  return draft(material, {
    intent_name: feature,
    topic: `feature_${slugify(feature)}`,
    buyer_stage: "Solution Research",
    intent_category: "Feature",
    prompts: [`${subject} ${feature}`],
    recommended_content: `A feature page documenting ${feature}`,
  });
}

/** Feature — one per option-style name/value specification entry. */
function specificationDraft(
  spec: { name: string; value: string },
  subject: string,
  material: DraftMaterial,
): ValidatedDraft {
  return draft(material, {
    intent_name: `${spec.name}: ${spec.value}`,
    topic: `feature_${slugify(`${spec.name} ${spec.value}`)}`,
    buyer_stage: "Solution Research",
    intent_category: "Feature",
    prompts: [`${subject} ${spec.name}`],
    recommended_content: `A specification entry for ${spec.name} on ${subject}`,
  });
}

interface PricePoint {
  amount: number;
  currency: string;
}

/** Displayed price plus every priced SKU — the price-range material. */
function collectedPrices(product: ProductProfile): PricePoint[] {
  const points: PricePoint[] = [];
  if (product.price !== undefined) {
    points.push(product.price);
  }
  for (const sku of product.skus) {
    if (sku.price !== undefined) {
      points.push(sku.price);
    }
  }
  return points;
}

/** "999 AUD" for a single price, "999–1099 AUD" for a range. */
function priceRangeLabel(points: PricePoint[]): string | undefined {
  const first = points[0];
  if (first === undefined) {
    return undefined;
  }
  const currency = first.currency;
  const amounts = points.filter((point) => point.currency === currency).map((point) => point.amount);
  const min = Math.min(...amounts);
  const max = Math.max(...amounts);
  return min === max ? `${min} ${currency}` : `${min}–${max} ${currency}`;
}

/**
 * Price — one per product, from the displayed price and the SKU price
 * range. Sale status is deliberately not derivable: schema v1 carries no
 * compare-at price field, and inventing "on sale" would be fabrication.
 */
function priceDraft(product: ProductProfile, material: DraftMaterial): ValidatedDraft | undefined {
  const label = priceRangeLabel(collectedPrices(product));
  if (label === undefined) {
    return undefined;
  }
  return draft(material, {
    intent_name: `${product.name} price`,
    topic: `price_${slugify(product.name)}`,
    buyer_stage: "Purchase Decision",
    intent_category: "Price",
    prompts: [`how much is ${product.name}`, `${product.name} price`],
    recommended_content: `Current pricing for ${product.name} (${label})`,
    recommended_cta: `Check the current ${product.name} price`,
  });
}

/** Purchase Conditions — from the shipping/returns fields the catalog exposes. */
function purchaseConditionsDraft(
  product: ProductProfile,
  material: DraftMaterial,
): ValidatedDraft | undefined {
  const conditions = product.shipping_and_returns ?? [];
  if (conditions.length === 0) {
    return undefined;
  }
  return draft(material, {
    intent_name: `${product.name} shipping and returns`,
    topic: `purchase_conditions_${slugify(product.name)}`,
    buyer_stage: "Purchase Decision",
    intent_category: "Purchase Conditions",
    prompts: [`${product.name} shipping`, `${product.name} return policy`],
    recommended_content: `Shipping and returns details: ${conditions.join("; ")}`,
    recommended_cta: `Review shipping and returns for ${product.name}`,
  });
}

/** Brand-scope derivations in spec category order, per market. */
export function deriveBrandDrafts(
  brand: BrandProfile,
  market: MarketTarget,
  evidenceUrls: readonly string[],
): ValidatedDraft[] {
  const material: DraftMaterial = {
    scope: "brand",
    brand_id: brand.brand_id,
    country: market.country,
    language: market.language,
    sku_ids: [],
    evidence_urls: [...evidenceUrls],
  };
  return [
    ...brand.categories.map((category) => categoryQuestionDraft(category, material)),
    ...brand.use_cases.map((useCase) => scenarioDraft(useCase, brand.name, material)),
  ];
}

/** Product-scope derivations in spec category order, per market. */
export function deriveProductDrafts(
  product: ProductProfile,
  market: MarketTarget,
  evidenceUrls: readonly string[],
): ValidatedDraft[] {
  const material: DraftMaterial = {
    scope: "product",
    brand_id: product.brand_id,
    country: market.country,
    language: market.language,
    // Product-scope intents cover the product, so they reference every SKU
    // the catalog evidences for it; the store layer scopes mappings from here.
    sku_ids: product.skus.map((sku) => sku.sku_id),
    evidence_urls: [...evidenceUrls],
  };
  const drafts = [
    ...product.features.map((feature) => featureDraft(feature, product.name, material)),
    ...product.specifications.map((spec) => specificationDraft(spec, product.name, material)),
    priceDraft(product, material),
    purchaseConditionsDraft(product, material),
    ...product.use_cases.map((useCase) => scenarioDraft(useCase, product.name, material)),
  ];
  return drafts.filter((candidate): candidate is ValidatedDraft => candidate !== undefined);
}

/**
 * SKU mappings for the derived product-scope intents: one per intent ×
 * evidenced SKU, landing on the PDP, eligibility unverified until a later
 * integration confirms it. Ids are pure (intent_id, sku_id) material, so
 * re-runs reproduce them exactly and stores can upsert idempotently.
 */
function buildSkuMappings(
  records: readonly { intent_id: string }[],
  product: ProductProfile,
  evidenceUrls: readonly string[],
): SkuIntentMapping[] {
  if (product.skus.length === 0) {
    return [];
  }
  const mappings: SkuIntentMapping[] = [];
  for (const record of records) {
    for (const sku of product.skus) {
      mappings.push(
        SkuIntentMappingSchema.parse({
          schema_version: SCHEMA_VERSION,
          mapping_id: `map_${slugify(`${record.intent_id}_${sku.sku_id}`)}`,
          intent_id: record.intent_id,
          sku_id: sku.sku_id,
          product_id: product.product_id,
          match_strength: 1,
          eligibility: "unverified",
          landing_url: product.url,
          evidence_urls: [...evidenceUrls],
        }),
      );
    }
  }
  return mappings;
}

export interface DeterministicGeneratorDeps {
  clock: Clock;
}

/**
 * The no-LLM realization of the generation seam. Every derivation is a pure
 * function of the validated catalog profiles and the run's snapshot
 * registry; the only injected side effect is the clock for generated_at.
 */
export class DeterministicIntentGenerator implements IntentGeneratorSeam {
  constructor(private readonly deps: DeterministicGeneratorDeps) {}

  /** Brand-level intents: Category Question and Scenario from store material. */
  async generateBrandIntents(brand: BrandProfile, run: GenerationRun): Promise<GenerationOutcome> {
    return this.generate((market, evidenceUrls) => deriveBrandDrafts(brand, market, evidenceUrls), run);
  }

  /** Product-level intents plus SKU mappings from the catalog fields. */
  async generateProductIntents(
    product: ProductProfile,
    run: GenerationRun,
  ): Promise<GenerationOutcome> {
    return this.generate(
      (market, evidenceUrls) => deriveProductDrafts(product, market, evidenceUrls),
      run,
      product,
    );
  }

  private async generate(
    deriveDrafts: (market: MarketTarget, evidenceUrls: readonly string[]) => ValidatedDraft[],
    run: GenerationRun,
    product?: ProductProfile,
  ): Promise<GenerationOutcome> {
    if (run.markets.length === 0) {
      throw new TypeError("GenerationRun.markets must not be empty");
    }
    const markets = run.markets.map(validateMarket);
    if (run.snapshots.length === 0) {
      return {
        ok: false,
        reason: "no_evidence",
        detail: "no stored snapshots were supplied — nothing is citable, so generation refuses to run",
      };
    }
    // run.retry is accepted for seam interchangeability and ignored here:
    // extraction calls nothing, so there is nothing to retry.
    const evidenceUrls = run.snapshots.map((snapshot) => snapshot.url);
    const maxCandidates = run.max_candidates_per_market ?? DEFAULT_MAX_CANDIDATES_PER_MARKET;

    const drafts: ValidatedDraft[] = [];
    let candidateCount = 0;
    for (const market of markets) {
      const derived = deriveDrafts(market, evidenceUrls);
      candidateCount += derived.length;
      drafts.push(...derived.slice(0, maxCandidates));
    }

    const dedup = dedupDrafts(drafts, run.existing ?? []);

    const generatedAt = this.deps.clock.isoNow();
    const records = dedup.assigned.map((assignment) =>
      buildStandaloneRecord(
        assignment.draft,
        { intent_id: assignment.intent_id, intent_version: assignment.intent_version },
        { generation_method: DETERMINISTIC_GENERATION_METHOD, generated_at: generatedAt },
      ),
    );
    const mappings = product !== undefined ? buildSkuMappings(records, product, evidenceUrls) : [];

    if (records.length === 0) {
      return {
        ok: false,
        reason: "generation_empty",
        detail:
          "the catalog profiles carried nothing derivable — no category, feature, price, purchase-condition, or scenario material",
      };
    }

    return {
      ok: true,
      records,
      mappings,
      report: {
        candidates: candidateCount,
        kept: records.length,
        reused: dedup.reused,
        fresh: dedup.fresh,
        dropped: [],
      },
    };
  }
}
