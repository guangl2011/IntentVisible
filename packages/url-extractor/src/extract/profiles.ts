import type { z } from "zod";

import { DomainSchema, SCHEMA_VERSION } from "@intentvisible/core-schema";
import type {
  BrandProfile,
  PriceSchema,
  ProductProfile,
  SkuSummarySchema,
} from "@intentvisible/core-schema";

import {
  extractCtas,
  extractDetailsFaqs,
  extractHeadingSectionItems,
  extractMetaContent,
  extractSpecTableRows,
  extractTitle,
  parseHtml,
} from "./html.js";
import {
  collectJsonLd,
  findTypedNodes,
  hasJsonLdType,
  isJsonObject,
  jsonLdNumber,
  jsonLdString,
  type JsonLdNode,
} from "./jsonld.js";
import type { Evidenced, LandingPageProfile } from "../landing-page.js";
import type { Clock } from "../clock.js";
import type { ExtractedPage } from "../types.js";

export type Price = z.output<typeof PriceSchema>;
export type SkuSummary = z.output<typeof SkuSummarySchema>;

/**
 * Profile builders (spec Flow, Extract row). The fabrication guard is
 * structural: every value is copied out of page content and immediately
 * bound to the URL of the page it came from — there is no code path that
 * emits a field without a source. Fields deterministic extraction cannot
 * evidence (personas, pain points, purchase barriers, competitor brands)
 * stay empty; the LLM engine enriches them later, with evidence.
 */

export type EvidencedValue<T> = Evidenced<T>;

export type ExtractionOutcome =
  | {
      ok: true;
      brand: BrandProfile | null;
      product: ProductProfile | null;
      landing_pages: LandingPageProfile[];
    }
  | { ok: false; reason: "extraction_empty"; detail: string };

interface PageContext {
  page: ExtractedPage;
  root: ReturnType<typeof parseHtml>;
  nodes: JsonLdNode[];
}

interface SourcedValue {
  value: string;
  pageUrl: string;
}

const GENERATION_METHOD = "deterministic_extraction" as const;

const BRAND_DIFFERENTIATOR_PATTERN = /why (choose|us|shop)|differentiator/i;
const USE_CASE_PATTERN = /use cases|applications|ideal for/i;
const COMPATIBILITY_PATTERN = /compatib|fits|works with|vehicles? (this|these)|fitment/i;
const FEATURE_PATTERN = /features|highlights|what'?s (in the box|included)/i;
const SHIPPING_PATTERN = /shipping|delivery|returns|warranty|freight/i;
const TRUST_PATTERN = /warranty|certification|award|guarantee|why trust/i;

export function extractProfiles(pages: ExtractedPage[], clock: Clock): ExtractionOutcome {
  const [firstPage] = pages;
  if (!firstPage) {
    return { ok: false, reason: "extraction_empty", detail: "no pages were fetched" };
  }

  const contexts = pages.map(newPageContext);
  const landingPages = contexts.map((context) => buildLandingPageProfile(context, clock));
  const brand = buildBrandProfile(contexts, clock);
  const product = buildProductProfile(contexts, clock);

  const linked = landingPages.map((landingPage) => ({
    ...landingPage,
    ...(brand ? { brand_id: brand.brand_id } : {}),
    ...(product && product.url === landingPage.url ? { product_id: product.product_id } : {}),
  }));

  if (!brand && !product && !linked.some(landingHasContent)) {
    return {
      ok: false,
      reason: "extraction_empty",
      detail: "no extractable brand, product, or landing-page content on any fetched page",
    };
  }
  return { ok: true, brand, product, landing_pages: linked };
}

function newPageContext(page: ExtractedPage): PageContext {
  return { page, root: parseHtml(page.snapshot.raw_html), nodes: collectJsonLd(page.snapshot.raw_html) };
}

function landingHasContent(landingPage: LandingPageProfile): boolean {
  return (
    landingPage.title !== null ||
    landingPage.description !== null ||
    landingPage.price !== null ||
    landingPage.specifications.length > 0 ||
    landingPage.faqs.length > 0 ||
    landingPage.ctas.length > 0 ||
    landingPage.features.length > 0 ||
    landingPage.use_cases.length > 0 ||
    landingPage.compatibility.length > 0 ||
    landingPage.shipping_and_returns.length > 0
  );
}

// ---------------------------------------------------------------------------
// Landing page profile (package-local, per-field evidence)
// ---------------------------------------------------------------------------

function buildLandingPageProfile(context: PageContext, clock: Clock): LandingPageProfile {
  const { page, root } = context;
  const url = page.snapshot.url;
  const title = extractTitle(root) ?? extractMetaContent(root, 'meta[property="og:title"]');
  const description =
    extractMetaContent(root, 'meta[name="description"]') ??
    extractMetaContent(root, 'meta[property="og:description"]');
  const price = metaPrice(root);

  const specifications = dedupeBy(
    [
      ...findTypedNodes(context.nodes, "Product").flatMap(parseAdditionalProperties),
      ...extractSpecTableRows(root),
    ],
    (entry) => entry.name.toLowerCase(),
  );
  const faqs = dedupeBy(
    [
      ...findTypedNodes(context.nodes, "FAQPage").flatMap(parseFaqPage),
      ...extractDetailsFaqs(root),
    ],
    (faq) => faq.question.toLowerCase(),
  );

  return {
    schema_version: SCHEMA_VERSION,
    url,
    title: title ? withEvidence(cap(title, 300), url) : null,
    description: description ? withEvidence(cap(description, 5000), url) : null,
    price: price ? withEvidence(price, url) : null,
    specifications: specifications
      .slice(0, 500)
      .map((entry) => withEvidence(entry, url)),
    faqs: faqs.slice(0, 100).map((faq) => withEvidence(faq, url)),
    ctas: extractCtas(root)
      .slice(0, 50)
      .map((cta) => withEvidence(cta, url)),
    features: extractHeadingSectionItems(root, FEATURE_PATTERN)
      .slice(0, 200)
      .map((feature) => withEvidence(cap(feature, 500), url)),
    use_cases: extractHeadingSectionItems(root, USE_CASE_PATTERN)
      .slice(0, 100)
      .map((useCase) => withEvidence(cap(useCase, 500), url)),
    compatibility: extractHeadingSectionItems(root, COMPATIBILITY_PATTERN)
      .slice(0, 100)
      .map((item) => withEvidence(cap(item, 500), url)),
    shipping_and_returns: extractHeadingSectionItems(root, SHIPPING_PATTERN)
      .slice(0, 50)
      .map((item) => withEvidence(cap(item, 500), url)),
    evidence_urls: [url],
    snapshot_refs: [page.stored],
    generation_method: GENERATION_METHOD,
    generated_at: clock.isoNow(),
  };
}

function metaPrice(root: ReturnType<typeof parseHtml>): Price | null {
  const amount = extractMetaContent(root, 'meta[property="product:price:amount"]');
  const currency = extractMetaContent(root, 'meta[property="product:price:currency"]');
  if (amount === null || !currency || !/^[A-Z]{3}$/.test(currency)) {
    return null;
  }
  const parsed = Number(amount);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return { amount: parsed, currency };
}

// ---------------------------------------------------------------------------
// Product profile (core-schema)
// ---------------------------------------------------------------------------

function buildProductProfile(contexts: PageContext[], clock: Clock): ProductProfile | null {
  for (const context of contexts) {
    const productNode = findTypedNodes(context.nodes, "Product")[0];
    if (!productNode) {
      continue;
    }
    const profile = buildProductProfileFromNode(context, productNode, clock);
    if (profile) {
      return profile;
    }
  }
  return null;
}

function buildProductProfileFromNode(
  context: PageContext,
  node: JsonLdNode,
  clock: Clock,
): ProductProfile | null {
  const url = context.page.snapshot.url;
  const name =
    jsonLdString(node["name"]) ??
    extractTitle(context.root) ??
    extractMetaContent(context.root, 'meta[property="og:title"]');
  if (!name) {
    // A product record cannot be named from evidence — not a product.
    return null;
  }

  const offers = parseOfferNodes(node);
  const price = offers.length === 1 ? parseOfferPrice(offers[0] ?? node) : null;
  const sku = jsonLdString(node["sku"]);

  const specifications = dedupeBy(
    [...parseAdditionalProperties(node), ...extractSpecTableRows(context.root)],
    (entry) => entry.name.toLowerCase(),
  );
  const faqs = dedupeBy(
    findTypedNodes(context.nodes, "FAQPage").flatMap(parseFaqPage),
    (faq) => faq.question.toLowerCase(),
  );
  const description = jsonLdString(node["description"]);

  return {
    schema_version: SCHEMA_VERSION,
    product_id: `product_${slugify(sku ?? name)}`,
    brand_id: `brand_${slugify(hostnameOf(url))}`,
    name: cap(name, 300),
    url,
    description: description ? cap(description, 5000) : undefined,
    price: price ?? undefined,
    features: sectionItems(context.root, FEATURE_PATTERN, 200),
    specifications: specifications.slice(0, 500),
    use_cases: sectionItems(context.root, USE_CASE_PATTERN, 100),
    compatibility: sectionItems(context.root, COMPATIBILITY_PATTERN, 100),
    faqs: faqs.slice(0, 100).length > 0 ? faqs.slice(0, 100) : undefined,
    skus: parseSkuSummaries(offers, url),
    shipping_and_returns: optionalSectionItems(context.root, SHIPPING_PATTERN, 50),
    evidence_urls: [url],
    snapshot_refs: [context.page.stored],
    generation_method: GENERATION_METHOD,
    generated_at: clock.isoNow(),
  };
}

function parseOfferNodes(node: JsonLdNode): JsonLdNode[] {
  const offers = node["offers"];
  const candidates = Array.isArray(offers) ? offers : [offers];
  return candidates
    .filter(isJsonObject)
    .filter((offer) => !hasJsonLdType(offer, "AggregateOffer"));
}

function parseOfferPrice(offer: JsonLdNode): Price | null {
  const amount = jsonLdNumber(offer["price"]);
  const currency = jsonLdString(offer["priceCurrency"])?.toUpperCase();
  if (amount === null || !currency || !/^[A-Z]{3}$/.test(currency)) {
    return null;
  }
  return { amount, currency };
}

/**
 * Variant summaries from multi-offer pages. A single offer IS the product,
 * so SKUs only exist when the page evidences a variant split (plan M3);
 * product-level price is likewise omitted when variants carry the prices.
 */
function parseSkuSummaries(offers: JsonLdNode[], pageUrl: string): SkuSummary[] {
  if (offers.length < 2) {
    return [];
  }
  const summaries: SkuSummary[] = [];
  for (const offer of offers) {
    const name = jsonLdString(offer["name"]);
    const sku = jsonLdString(offer["sku"]);
    if (!name && !sku) {
      continue;
    }
    const price = parseOfferPrice(offer);
    const offerUrl = resolveUrl(jsonLdString(offer["url"]), pageUrl);
    summaries.push({
      sku_id: `sku_${slugify(sku ?? name ?? "unknown")}`,
      name: name ? cap(name, 300) : undefined,
      price: price ?? undefined,
      url: offerUrl ?? undefined,
    });
  }
  return summaries.slice(0, 500);
}

function parseAdditionalProperties(node: JsonLdNode): Array<{ name: string; value: string }> {
  const properties = node["additionalProperty"];
  if (!Array.isArray(properties)) {
    return [];
  }
  const entries: Array<{ name: string; value: string }> = [];
  for (const property of properties) {
    if (!isJsonObject(property)) {
      continue;
    }
    const name = jsonLdString(property["name"]);
    const rawValue = property["value"];
    const numeric = jsonLdNumber(rawValue);
    const value = jsonLdString(rawValue) ?? (numeric === null ? null : String(numeric));
    if (!name || !value) {
      continue;
    }
    entries.push({ name: cap(name, 200), value: cap(value, 500) });
  }
  return entries;
}

function parseFaqPage(node: JsonLdNode): Array<{ question: string; answer: string }> {
  const questions = node["mainEntity"];
  if (!Array.isArray(questions)) {
    return [];
  }
  const faqs: Array<{ question: string; answer: string }> = [];
  for (const questionNode of questions) {
    if (!isJsonObject(questionNode)) {
      continue;
    }
    const question = jsonLdString(questionNode["name"]);
    const answerNode = questionNode["acceptedAnswer"];
    const answer = isJsonObject(answerNode)
      ? jsonLdString(answerNode["text"])
      : jsonLdString(answerNode);
    if (!question || !answer) {
      continue;
    }
    faqs.push({ question: cap(question, 500), answer: cap(answer, 2000) });
  }
  return faqs;
}

// ---------------------------------------------------------------------------
// Brand profile (core-schema)
// ---------------------------------------------------------------------------

function buildBrandProfile(contexts: PageContext[], clock: Clock): BrandProfile | null {
  const first = contexts[0];
  if (!first) {
    return null;
  }
  const domain = hostnameOf(first.page.snapshot.url);
  if (!DomainSchema.safeParse(domain).success) {
    return null;
  }

  let name: SourcedValue | null = null;
  let description: SourcedValue | null = null;
  const categories: string[] = [];
  const differentiators: string[] = [];
  const useCases: string[] = [];
  const trustEvidence: string[] = [];
  const evidenceUrls: string[] = [];

  const markEvidence = (pageUrl: string): void => pushUnique(evidenceUrls, pageUrl);

  for (const context of contexts) {
    const pageUrl = context.page.snapshot.url;
    const organizations = findTypedNodes(context.nodes, "Organization");
    const websites = findTypedNodes(context.nodes, "WebSite");
    const products = findTypedNodes(context.nodes, "Product");
    const org = organizations[0] ?? websites[0];

    if (org) {
      const orgName = jsonLdString(org["name"]);
      const orgDescription = jsonLdString(org["description"]);
      if (orgName && !name) {
        name = { value: orgName, pageUrl };
        markEvidence(pageUrl);
      }
      if (orgDescription && !description) {
        description = { value: orgDescription, pageUrl };
        markEvidence(pageUrl);
      }
    }

    if (!name) {
      const productBrandName = products
        .map(brandNameOf)
        .find((candidate): candidate is string => candidate !== null);
      if (productBrandName) {
        name = { value: productBrandName, pageUrl };
        markEvidence(pageUrl);
      }
    }

    if (!name) {
      const ogSiteName = extractMetaContent(context.root, 'meta[property="og:site_name"]');
      if (ogSiteName) {
        name = { value: ogSiteName, pageUrl };
        markEvidence(pageUrl);
      }
    }

    if (!description) {
      const metaDescription =
        extractMetaContent(context.root, 'meta[name="description"]') ??
        extractMetaContent(context.root, 'meta[property="og:description"]');
      if (metaDescription) {
        description = { value: metaDescription, pageUrl };
        markEvidence(pageUrl);
      }
    }

    for (const product of products) {
      const category = jsonLdString(product["category"]);
      if (category) {
        pushUnique(categories, cap(category, 200));
        markEvidence(pageUrl);
      }
    }
    for (const breadcrumb of findTypedNodes(context.nodes, "BreadcrumbList")) {
      for (const breadcrumbName of parseBreadcrumbNames(breadcrumb)) {
        pushUnique(categories, cap(breadcrumbName, 200));
        markEvidence(pageUrl);
      }
    }

    for (const [target, pattern] of [
      [differentiators, BRAND_DIFFERENTIATOR_PATTERN],
      [useCases, USE_CASE_PATTERN],
      [trustEvidence, TRUST_PATTERN],
    ] as const) {
      const items = extractHeadingSectionItems(context.root, pattern);
      if (items.length > 0) {
        for (const item of items) {
          pushUnique(target, cap(item, 500));
        }
        markEvidence(pageUrl);
      }
    }
  }

  // Evidence-first: without a name the site itself evidences (JSON-LD org,
  // product brand, og:site_name), there is no brand record — the hostname
  // alone is not a claim we make. extraction_empty is then reachable.
  if (!name) {
    return null;
  }
  // The naming page is always primary evidence, exactly once.
  if (!evidenceUrls.includes(name.pageUrl)) {
    evidenceUrls.unshift(name.pageUrl);
  }
  const evidenceSet = new Set(evidenceUrls);

  return {
    schema_version: SCHEMA_VERSION,
    brand_id: `brand_${slugify(domain)}`,
    name: cap(name.value, 300),
    domain,
    description: description ? cap(description.value, 2000) : undefined,
    categories: categories.slice(0, 50),
    competitor_brands: [],
    differentiators: differentiators.slice(0, 100),
    use_cases: useCases.slice(0, 100),
    personas: [],
    pain_points: [],
    purchase_barriers: [],
    trust_evidence: trustEvidence.slice(0, 100),
    evidence_urls: evidenceUrls.slice(0, 100),
    snapshot_refs: contexts
      .filter((context) => evidenceSet.has(context.page.snapshot.url))
      .map((context) => context.page.stored)
      .slice(0, 200),
    generation_method: GENERATION_METHOD,
    generated_at: clock.isoNow(),
  };
}

/** Brand name from Product.brand / Product.manufacturer, when present. */
function brandNameOf(product: JsonLdNode): string | null {
  for (const field of ["brand", "manufacturer"]) {
    const value = product[field];
    if (typeof value === "string") {
      const name = value.trim();
      if (name.length > 0) {
        return name;
      }
    }
    if (isJsonObject(value)) {
      const name = jsonLdString(value["name"]);
      if (name) {
        return name;
      }
    }
  }
  return null;
}

function parseBreadcrumbNames(node: JsonLdNode): string[] {
  const items = node["itemListElement"];
  if (!Array.isArray(items)) {
    return [];
  }
  const names: string[] = [];
  for (const item of items) {
    if (typeof item === "string") {
      const name = item.trim();
      if (name.length > 0) {
        names.push(name);
      }
      continue;
    }
    if (!isJsonObject(item)) {
      continue;
    }
    const direct = jsonLdString(item["name"]);
    if (direct) {
      names.push(direct);
      continue;
    }
    const nested = item["item"];
    if (typeof nested === "string") {
      const name = nested.trim();
      if (name.length > 0) {
        names.push(name);
      }
    } else if (isJsonObject(nested)) {
      const name = jsonLdString(nested["name"]);
      if (name) {
        names.push(name);
      }
    }
  }
  return names;
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

/** Heading-section items, capped per item and count. */
function sectionItems(root: ReturnType<typeof parseHtml>, pattern: RegExp, max: number): string[] {
  return extractHeadingSectionItems(root, pattern)
    .slice(0, max)
    .map((item) => cap(item, 500));
}

/** sectionItems, but undefined when the page shows no such section. */
function optionalSectionItems(
  root: ReturnType<typeof parseHtml>,
  pattern: RegExp,
  max: number,
): string[] | undefined {
  const items = sectionItems(root, pattern, max);
  return items.length > 0 ? items : undefined;
}

function withEvidence<T>(value: T, evidenceUrl: string): Evidenced<T> {
  return { value, evidence_url: evidenceUrl };
}

function cap(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text;
}

function hostnameOf(url: string): string {
  return new URL(url).hostname.toLowerCase();
}

function slugify(input: string, maxLength = 60): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, maxLength);
  return slug.length > 0 ? slug : "unknown";
}

function resolveUrl(raw: string | null, baseUrl: string): string | null {
  if (!raw) {
    return null;
  }
  try {
    const resolved = new URL(raw, baseUrl);
    if (resolved.protocol !== "http:" && resolved.protocol !== "https:") {
      return null;
    }
    return resolved.toString();
  } catch {
    return null;
  }
}

function pushUnique(list: string[], value: string): void {
  const key = value.toLowerCase();
  if (!list.some((existing) => existing.toLowerCase() === key)) {
    list.push(value);
  }
}

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(item);
  }
  return result;
}
