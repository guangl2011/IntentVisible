/**
 * Evidence-first prompt construction (spec Flow, Generate row): the prompt
 * supplies the page evidence and the market, and demands citations — the
 * model may only claim what the evidence shows and may only cite URLs from
 * the supplied registry.
 */

import type { BrandProfile, ProductProfile } from "@intentvisible/core-schema";

/** One target market for generation; prompts are written per market. */
export interface MarketTarget {
  country: string;
  language: string;
}

/**
 * Brand-level intent types (plan M2): category questions, comparisons,
 * scenarios, price, risk & trust.
 */
export const BRAND_INTENT_CATEGORIES = [
  "Category Question",
  "Comparison",
  "Scenario",
  "Price",
  "Risk & Trust",
] as const;

/**
 * Product-level intent types (plan M2): features, compatibility, purchase
 * conditions, after-sales.
 */
export const PRODUCT_INTENT_CATEGORIES = [
  "Feature",
  "Compatibility",
  "Purchase Conditions",
  "After-sales",
] as const;

const BUYER_STAGE_LIST =
  "Awareness, Consideration, Solution Research, Comparison, Purchase Decision";

/**
 * Standing instructions for every generation call. The three hard rules map
 * one-to-one onto the validator's drop reasons: evidence-first claims,
 * citation subset, and no measured metrics.
 */
export function intentSystemPrompt(categories: readonly string[]): string {
  return [
    "You are a buyer-intent analyst. You receive structured page evidence extracted from a brand's own website and produce buyer-intent candidates as a JSON array.",
    "",
    "Rules you must never break:",
    "1. Evidence-first: every claim in a candidate must be supported by the supplied page evidence. Never state a fact the evidence does not show.",
    "2. Cite only supplied evidence: every candidate's evidence_urls must be a subset of the evidence registry in the input. Never cite any other URL.",
    "3. No measured metrics: never invent, estimate, or guess search volumes, visibility percentages, or any other measurement. You have no access to measurements.",
    "4. Output format: reply with ONLY a JSON array of candidate objects — no markdown fences, no commentary.",
    "",
    "Each candidate object has exactly these keys:",
    "- intent_name: short stable name for the intent (2-5 words)",
    "- topic: lowercase_snake semantic topic key naming the underlying buyer question (2-4 words, e.g. camping_fridge_runtime, rival_comparison, warranty_durability). Two differently-worded questions about the same underlying concern must share one topic.",
    `- buyer_stage: one of ${BUYER_STAGE_LIST}`,
    `- intent_category: one of ${categories.join(", ")}`,
    "- persona: target buyer persona, from the evidence where available",
    "- pain_point: the buyer problem this intent addresses, grounded in the evidence",
    "- prompts: 1-3 search prompts a real shopper in the target market would type, written in the target market's language",
    "- recommended_content: content idea that would serve this intent",
    "- recommended_cta: call to action for the brand",
    "- sku_ids: SKU ids from the supplied evidence this intent relates to (empty array when none)",
    "- evidence_urls: subset of the evidence registry supporting this candidate",
    "- confidence: low, medium, or high — how well the page evidence supports this candidate",
  ].join("\n");
}

export interface PromptBuild {
  system: string;
  user: string;
  market: MarketTarget;
}

function languageLabel(language: string): string {
  try {
    const name = new Intl.DisplayNames([language], { type: "language" }).of(language);
    if (name !== undefined && name !== language) {
      return `${name} (${language})`;
    }
  } catch {
    // ICU without full data — the code alone is still unambiguous.
  }
  return language;
}

function marketBlock(market: MarketTarget): string {
  return [
    `Target market: country=${market.country}, language=${market.language}.`,
    `Write every shopper-facing text field (prompts, persona, pain_point, recommended_content, recommended_cta) in ${languageLabel(market.language)}, localized for the ${market.country} market.`,
  ].join("\n");
}

function evidenceBlock(evidenceUrls: readonly string[]): string {
  return [
    "Evidence registry — the ONLY URLs you may cite:",
    ...evidenceUrls.map((url) => `- ${url}`),
  ].join("\n");
}

/** Serializes the brand profile's evidence-bearing facts for the prompt. */
function brandEvidenceJson(brand: BrandProfile): string {
  return JSON.stringify(
    {
      description: brand.description ?? null,
      categories: brand.categories,
      competitor_brands: brand.competitor_brands,
      differentiators: brand.differentiators,
      use_cases: brand.use_cases,
      personas: brand.personas,
      pain_points: brand.pain_points,
      purchase_barriers: brand.purchase_barriers,
      trust_evidence: brand.trust_evidence,
    },
    null,
    2,
  );
}

/** Serializes the product profile's evidence-bearing facts for the prompt. */
function productEvidenceJson(product: ProductProfile): string {
  return JSON.stringify(
    {
      name: product.name,
      description: product.description ?? null,
      price: product.price ?? null,
      features: product.features,
      specifications: product.specifications,
      use_cases: product.use_cases,
      compatibility: product.compatibility,
      faqs: product.faqs ?? null,
      skus: product.skus.map((sku) => ({ sku_id: sku.sku_id, name: sku.name ?? null })),
      shipping_and_returns: product.shipping_and_returns ?? null,
    },
    null,
    2,
  );
}

function userPrompt(parts: readonly string[]): string {
  return parts.join("\n");
}

/** Builds the system+user prompt pair for one brand-level, per-market generation call. */
export function buildBrandPrompt(
  brand: BrandProfile,
  market: MarketTarget,
  evidenceUrls: readonly string[],
): PromptBuild {
  const categories = BRAND_INTENT_CATEGORIES;
  return {
    system: intentSystemPrompt(categories),
    user: userPrompt([
      `Brand evidence for ${brand.name} (domain ${brand.domain}), extracted from the brand's website:`,
      brandEvidenceJson(brand),
      "",
      evidenceBlock(evidenceUrls),
      "",
      marketBlock(market),
      "",
      "Brand-level intent categories to cover — one candidate each where the evidence supports it, and none without evidence support:",
      ...categories.map((category) => `- ${category}`),
      "",
      "sku_ids must be [] for brand-level candidates.",
    ]),
    market,
  };
}

/** Builds the system+user prompt pair for one product-level, per-market generation call. */
export function buildProductPrompt(
  product: ProductProfile,
  market: MarketTarget,
  evidenceUrls: readonly string[],
): PromptBuild {
  const categories = PRODUCT_INTENT_CATEGORIES;
  const skuLine =
    product.skus.length > 0
      ? `SKUs evidenced on the page (sku_ids must be a subset of these): ${product.skus
          .map((sku) => sku.sku_id)
          .join(", ")}`
      : "No variant SKUs are evidenced; use sku_ids: [].";
  return {
    system: intentSystemPrompt(categories),
    user: userPrompt([
      `Product evidence for ${product.name} (product_id ${product.product_id}, brand ${product.brand_id}), extracted from ${product.url}:`,
      productEvidenceJson(product),
      "",
      evidenceBlock(evidenceUrls),
      "",
      marketBlock(market),
      "",
      "Product-level intent categories to cover — one candidate each where the evidence supports it, and none without evidence support:",
      ...categories.map((category) => `- ${category}`),
      "",
      skuLine,
    ]),
    market,
  };
}
