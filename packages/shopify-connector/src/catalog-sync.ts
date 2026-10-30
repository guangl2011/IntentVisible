/**
 * Cursor-paginated Admin GraphQL catalog sync (spec D1): pulls the shop
 * resource and every product/variant page, persists each raw response page
 * as a SHA-256 content-hashed snapshot (the incremental-refresh key per
 * core-schema's SnapshotRef), and maps everything into core-schema
 * BrandProfile/ProductProfile records. Deterministic extraction only — no
 * LLM anywhere in this module.
 *
 * Mapping policy: a broken shop resource or malformed connection aborts the
 * sync with a typed `graphql_error` (the caller cannot trust the page
 * stream); a broken SINGLE product maps to a per-product failure entry so
 * one bad record never loses the catalog. The raw pages are always
 * returned, so failed mappings remain auditable.
 */

import type {
  BrandProfile,
  ProductProfile,
  SkuSummarySchema,
} from "@intentvisible/core-schema";
import {
  BrandProfileSchema,
  ProductProfileSchema,
  PriceSchema,
  SnapshotRefSchema,
  SCHEMA_VERSION,
  UrlSchema,
} from "@intentvisible/core-schema";

import type { AdminGraphQLClient, GraphQLResponse } from "./admin-api.js";
import { sha256Hex } from "./crypto.js";
import { ShopifyConnectorError } from "./errors.js";

/** Contract record types core-schema does not re-export directly — derived
 * from its Zod schemas so the shapes can never drift from the contracts. */
export type SnapshotRef = ReturnType<typeof SnapshotRefSchema.parse>;
export type SkuSummary = ReturnType<typeof SkuSummarySchema.parse>;
export type CatalogPrice = ReturnType<typeof PriceSchema.parse>;

/**
 * A page of the Admin GraphQL response, kept verbatim. `storageRef` is the
 * object-storage key the API layer persists the page under — the connector
 * never writes storage itself.
 */
export interface CatalogSnapshotPage {
  /** The Admin GraphQL endpoint the page came from. */
  readonly url: string;
  /** SHA-256 hex of the raw response body. */
  readonly contentHash: string;
  /** RFC 3339 UTC fetch time. */
  readonly fetchedAt: string;
  /** Storage reference: `shopify-catalog://{shopDomain}/{contentHash}.json`. */
  readonly storageRef: string;
  /** The raw response body — the caller persists it at storageRef. */
  readonly raw: string;
}

export interface CatalogSyncFailure {
  readonly shopDomain: string;
  /** `product_<id>` when known; undefined for products with no usable id. */
  readonly shopifyProductId: string | undefined;
  readonly reason: string;
}

export interface CatalogSyncResult {
  readonly shopDomain: string;
  readonly brand: BrandProfile;
  readonly products: ProductProfile[];
  /** Every raw page fetched (shop + product pages + variant overflow pages). */
  readonly pages: CatalogSnapshotPage[];
  readonly failures: CatalogSyncFailure[];
}

export interface CatalogSyncOptions {
  /** Products per page, 1–250 (Shopify connection cap). Default 100. */
  readonly pageSize?: number;
  /** Variants per product page, 1–250. Default 250. */
  readonly variantsPageSize?: number;
  /** Injectable clock for snapshot fetch times. */
  readonly now?: () => Date;
}

export interface CatalogMappingContext {
  readonly shopDomain: string;
  readonly primaryDomainHost: string;
  readonly primaryDomainUrl: string;
  readonly currencyCode: string;
  readonly fetchedAt: string;
}

/** Narrow view of an Admin GraphQL connection — nodes stay objects. */
export interface ShopifyConnection<TNode> {
  readonly nodes: readonly TNode[];
  readonly pageInfo: { readonly hasNextPage: boolean; readonly endCursor: string | null };
}

/** The shop resource fields the brand profile is built from. */
export interface ShopResource {
  readonly name: string;
  readonly description: string | undefined;
  readonly currencyCode: string;
  readonly myshopifyDomain: string;
  readonly url: string;
  readonly primaryDomain: { readonly host: string; readonly url: string };
}

const MAX_PAGES = 10_000; // runaway-pagination guard: 10k pages × page size

/**
 * Fields selected per product. `description(truncateAt: 5000)` matches the
 * ProductProfileSchema cap; shopify.dev (Product, verified 2026-10-30):
 * description is a single HTML-tag-stripped line, legacyResourceId is the
 * REST id, onlineStoreUrl is null when the product is unpublished.
 */
const CATALOG_PRODUCT_FIELDS = /* GraphQL */ `
      id
      legacyResourceId
      title
      handle
      description(truncateAt: 5000)
      onlineStoreUrl
      onlineStorePreviewUrl
      options {
        name
      }
      variants(first: $variantsFirst) {
        nodes {
          id
          legacyResourceId
          title
          price {
            amount
            currencyCode
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
`;

const SHOP_RESOURCE_QUERY = /* GraphQL */ `
  query ShopResource {
    shop {
      name
      description
      currencyCode
      myshopifyDomain
      url
      primaryDomain {
        host
        url
      }
    }
  }
`;

const CATALOG_PAGE_QUERY = /* GraphQL */ `
  query CatalogPage($first: Int!, $after: String, $variantsFirst: Int!) {
    products(first: $first, after: $after, sortKey: ID) {
      nodes {
${CATALOG_PRODUCT_FIELDS}
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

/** Variant overflow: one product's variants beyond the first page. */
const VARIANT_OVERFLOW_QUERY = /* GraphQL */ `
  query ProductVariantsPage($id: ID!, $first: Int!, $after: String) {
    product(id: $id) {
      variants(first: $first, after: $after) {
        nodes {
          id
          legacyResourceId
          title
          price {
            amount
            currencyCode
          }
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
`;

/**
 * Runs a full catalog sync for the client's store: shop resource → every
 * product page (with variant overflow merge) → brand profile. Throws typed
 * errors for store-level failures; per-product problems land in `failures`.
 */
export async function syncCatalog(
  client: AdminGraphQLClient,
  options: CatalogSyncOptions = {},
): Promise<CatalogSyncResult> {
  const pageSize = options.pageSize ?? 100;
  const variantsPageSize = options.variantsPageSize ?? 250;
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250) {
    throw new Error(`pageSize must be an integer between 1 and 250, got ${pageSize}`);
  }
  if (!Number.isInteger(variantsPageSize) || variantsPageSize < 1 || variantsPageSize > 250) {
    throw new Error(
      `variantsPageSize must be an integer between 1 and 250, got ${variantsPageSize}`,
    );
  }
  const now = options.now ?? (() => new Date());
  const shopDomain = client.shopDomain;

  // 1. Shop resource — the brand profile's source of truth.
  const shopResponse = await client.request(SHOP_RESOURCE_QUERY);
  const shopPage = snapshotPageFrom(
    shopResponse,
    client.endpoint,
    shopDomain,
    now().toISOString(),
  );
  const shop = narrowShopResource(requireDataObject(shopResponse).shop, shopDomain);

  const pages: CatalogSnapshotPage[] = [shopPage.page];
  const products: ProductProfile[] = [];
  const failures: CatalogSyncFailure[] = [];

  // 2. Cursor-paginated product pages.
  let after: string | null = null;
  let pageCount = 0;
  do {
    if (++pageCount > MAX_PAGES) {
      throw new ShopifyConnectorError(
        "graphql_error",
        `catalog pagination did not terminate after ${MAX_PAGES} pages`,
        { storeId: client.storeId, shopDomain },
      );
    }
    const response = await client.request(CATALOG_PAGE_QUERY, {
      first: pageSize,
      after,
      variantsFirst: variantsPageSize,
    });
    const page = snapshotPageFrom(response, client.endpoint, shopDomain, now().toISOString());
    pages.push(page.page);
    const data = requireDataObject(response);
    const connection = requireConnection(data.products, "products");

    for (const node of connection.nodes) {
      const productId = bestEffortProductId(node);
      const pageRefs: SnapshotRef[] = [page.ref];
      try {
        // Inside the guard: a failed variant refetch is one product's
        // failure, not a lost catalog.
        const merged = await withFullVariants(client, node, variantsPageSize, pages, pageRefs, now);
        const context: CatalogMappingContext = {
          shopDomain,
          primaryDomainHost: shop.primaryDomain.host,
          primaryDomainUrl: shop.primaryDomain.url,
          currencyCode: shop.currencyCode,
          fetchedAt: page.page.fetchedAt,
        };
        const { profile, issues } = toProductProfile(merged, context, pageRefs);
        products.push(profile);
        for (const issue of issues) {
          failures.push({ shopDomain, shopifyProductId: profile.product_id, reason: issue });
        }
      } catch (error) {
        failures.push({
          shopDomain,
          shopifyProductId: productId,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    }

    after = nextPageCursor(connection.pageInfo, "products");
  } while (after !== null);

  // 3. Brand profile — every page fetched backs it (shop resource first).
  const brand = toBrandProfile(shop, pages.map(snapshotRefOf), shopPage.page.fetchedAt);

  return { shopDomain, brand, products, pages, failures };
}

/**
 * Returns the product node with its variants connection COMPLETED: when the
 * first page reported more variants, refetches the remaining pages via the
 * root product query and merges them, so mappers always see one connection.
 */
async function withFullVariants(
  client: AdminGraphQLClient,
  node: Record<string, unknown>,
  variantsPageSize: number,
  pages: CatalogSnapshotPage[],
  pageRefs: SnapshotRef[],
  now: () => Date,
): Promise<Record<string, unknown>> {
  const variants = requireConnection(node.variants, "product.variants");
  if (!variants.pageInfo.hasNextPage) {
    return node;
  }
  const gid = stringField(node, "id");
  if (gid === undefined) {
    throw new ShopifyConnectorError(
      "graphql_error",
      "product with paginated variants carries no id — cannot refetch variant pages",
      { storeId: client.storeId, shopDomain: client.shopDomain },
    );
  }

  const merged: Record<string, unknown>[] = [...variants.nodes];
  let after: string | null = variants.pageInfo.endCursor;
  let pageCount = 0;
  while (after !== null) {
    if (++pageCount > MAX_PAGES) {
      throw new ShopifyConnectorError(
        "graphql_error",
        `variant pagination did not terminate after ${MAX_PAGES} pages`,
        { storeId: client.storeId, shopDomain: client.shopDomain },
      );
    }
    const response = await client.request(VARIANT_OVERFLOW_QUERY, {
      id: gid,
      first: variantsPageSize,
      after,
    });
    const page = snapshotPageFrom(response, client.endpoint, client.shopDomain, now().toISOString());
    pages.push(page.page);
    pageRefs.push(page.ref);
    const data = requireDataObject(response);
    const product = requireObject(data.product, "ProductVariantsPage.data.product");
    const connection = requireConnection(product.variants, "product.variants");
    merged.push(...connection.nodes);
    after = nextPageCursor(connection.pageInfo, "product.variants");
  }
  return { ...node, variants: { nodes: merged, pageInfo: { hasNextPage: false, endCursor: null } } };
}

/**
 * Maps one product node into a validated ProductProfile. Throws (plain
 * Error) when the product cannot be mapped at all; soft issues (a variant
 * with an unparseable price) come back in `issues` for failure reporting.
 */
export function toProductProfile(
  node: Record<string, unknown>,
  context: CatalogMappingContext,
  snapshotRefs: SnapshotRef[],
): { profile: ProductProfile; issues: string[] } {
  const issues: string[] = [];
  const numericId = requireShopifyNumericId(node, "product");
  const title = requireString(node, "title", `product ${numericId}`);
  const handle = requireString(node, "handle", `product ${numericId}`);

  // Canonical PDP URL: the store-reported storefront URL, then the preview
  // URL, then the primary-domain fallback for unpublished products.
  const pdpUrl = firstValidUrl([
    stringField(node, "onlineStoreUrl"),
    stringField(node, "onlineStorePreviewUrl"),
    `https://${context.primaryDomainHost}/products/${handle}`,
  ]);
  if (pdpUrl === undefined) {
    throw new Error(`product ${numericId} has no valid storefront URL candidate`);
  }

  const skus: SkuSummary[] = [];
  for (const variant of requireConnection(node.variants, `product ${numericId}.variants`).nodes) {
    const variantId = shopifyNumericId(variant);
    if (variantId === undefined) {
      issues.push(`variant of product ${numericId} carries no usable id — skipped`);
      continue;
    }
    const variantTitle = stringField(variant, "title");
    const price = mapVariantPrice(variant);
    if (price === undefined) {
      issues.push(`variant ${variantId} of product ${numericId} has no parseable price`);
    }
    skus.push({
      sku_id: `sku_${variantId}`,
      ...(variantTitle !== undefined ? { name: variantTitle } : {}),
      ...(price !== undefined ? { price } : {}),
    });
  }

  // Product price: the cheapest variant's displayed price (min across SKUs).
  let price: CatalogPrice | undefined;
  for (const sku of skus) {
    if (sku.price === undefined) continue;
    if (price === undefined || sku.price.amount < price.amount) price = sku.price;
  }

  const description = stringField(node, "description");
  const features: string[] = [];
  const options = node.options;
  if (Array.isArray(options)) {
    for (const option of options) {
      if (typeof option === "object" && option !== null) {
        const name = stringField(option as Record<string, unknown>, "name");
        if (name !== undefined) features.push(name);
      }
    }
  } else {
    issues.push(`product ${numericId} carries no options array`);
  }

  const record = {
    schema_version: SCHEMA_VERSION,
    product_id: `product_${numericId}`,
    brand_id: brandIdFromShopDomain(context.shopDomain),
    name: title,
    url: pdpUrl,
    ...(description !== undefined ? { description } : {}),
    ...(price !== undefined ? { price } : {}),
    features,
    specifications: [],
    use_cases: [],
    compatibility: [],
    skus,
    evidence_urls: [...new Set([pdpUrl, context.primaryDomainUrl])].filter(
      (url) => UrlSchema.safeParse(url).success,
    ),
    snapshot_refs: snapshotRefs,
    generation_method: "deterministic_extraction",
    generated_at: context.fetchedAt,
  } as const;
  return { profile: parseOrThrow(ProductProfileSchema, record, `product ${numericId}`), issues };
}

/**
 * Maps the shop resource into a validated BrandProfile. Competitive and
 * persona fields stay empty — the connector extracts only what the Admin
 * API evidences; richer fields come from page extraction, not this module.
 */
export function toBrandProfile(
  shop: ShopResource,
  snapshotRefs: SnapshotRef[],
  generatedAt: string,
): BrandProfile {
  const evidenceUrls = [...new Set([shop.url, shop.primaryDomain.url])].filter(
    (url) => UrlSchema.safeParse(url).success,
  );
  if (evidenceUrls.length === 0) {
    throw new Error(`shop ${shop.myshopifyDomain} carries no valid evidence URL`);
  }
  const record = {
    schema_version: SCHEMA_VERSION,
    brand_id: brandIdFromShopDomain(shop.myshopifyDomain),
    name: shop.name,
    domain: shop.myshopifyDomain,
    ...(shop.description !== undefined
      ? { description: truncateCodePoints(shop.description, 2000) }
      : {}),
    categories: [],
    competitor_brands: [],
    differentiators: [],
    use_cases: [],
    personas: [],
    pain_points: [],
    purchase_barriers: [],
    trust_evidence: [],
    evidence_urls: evidenceUrls,
    snapshot_refs: snapshotRefs,
    generation_method: "deterministic_extraction",
    generated_at: generatedAt,
  } as const;
  return parseOrThrow(BrandProfileSchema, record, `shop ${shop.myshopifyDomain}`);
}

/** `brand_<slug>` from the {slug}.myshopify.com domain — the stable brand id. */
export function brandIdFromShopDomain(shopDomain: string): string {
  const slug = shopDomain.split(".")[0] ?? "";
  const slugged = slug
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (slugged === "") {
    throw new Error(`cannot derive a brand id from shop domain "${shopDomain}"`);
  }
  return `brand_${slugged}`;
}

/** The REST numeric id of a Shopify node — from legacyResourceId or the gid tail. */
export function shopifyNumericId(node: Record<string, unknown>): string | undefined {
  const legacy = stringField(node, "legacyResourceId");
  if (legacy !== undefined && /^\d+$/.test(legacy)) return legacy;
  const gid = stringField(node, "id");
  return gid !== undefined ? numericIdFromShopifyId(gid) : undefined;
}

/** The numeric tail of a gid ("gid://shopify/Product/123" → "123"). */
export function numericIdFromShopifyId(shopifyId: string): string | undefined {
  const lastSegment = shopifyId.split("/").pop() ?? "";
  return /^\d+$/.test(lastSegment) ? lastSegment : undefined;
}

function requireShopifyNumericId(node: Record<string, unknown>, what: string): string {
  const id = shopifyNumericId(node);
  if (id === undefined) {
    throw new Error(`${what} node carries no usable id (legacyResourceId/gid)`);
  }
  return id;
}

function bestEffortProductId(node: Record<string, unknown>): string | undefined {
  const id = shopifyNumericId(node);
  return id === undefined ? undefined : `product_${id}`;
}

/** Variant price: Money.amount is a Decimal (JSON string, shopify.dev
 * ProductVariant — verified 2026-10-30); missing/unparseable → undefined. */
function mapVariantPrice(variant: Record<string, unknown>): CatalogPrice | undefined {
  if (typeof variant.price !== "object" || variant.price === null) {
    return undefined;
  }
  const money = variant.price as Record<string, unknown>;
  const amount = parsePriceAmount(money.amount);
  const currency = stringField(money, "currencyCode");
  if (amount === undefined || currency === undefined) {
    return undefined;
  }
  const parsed = PriceSchema.safeParse({ amount, currency });
  return parsed.success ? parsed.data : undefined;
}

/** Accepts the Decimal string ("129.00") or a number; rejects everything else. */
function parsePriceAmount(value: unknown): number | undefined {
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  return undefined;
}

function narrowShopResource(shopData: unknown, expectedDomain: string): ShopResource {
  const shop = requireObject(shopData, "shop");
  const myshopifyDomain = requireString(shop, "myshopifyDomain", "shop");
  if (myshopifyDomain !== expectedDomain) {
    throw new ShopifyConnectorError(
      "graphql_error",
      `shop resource myshopifyDomain "${myshopifyDomain}" does not match the configured store domain "${expectedDomain}" — the token does not belong to this store`,
    );
  }
  const primaryDomain = requireObject(shop.primaryDomain, "shop.primaryDomain");
  return {
    name: requireString(shop, "name", "shop"),
    description: stringField(shop, "description"),
    currencyCode: requireString(shop, "currencyCode", "shop"),
    myshopifyDomain,
    url: requireString(shop, "url", "shop"),
    primaryDomain: {
      host: requireString(primaryDomain, "host", "shop.primaryDomain"),
      url: requireString(primaryDomain, "url", "shop.primaryDomain"),
    },
  };
}

function snapshotPageFrom(
  response: GraphQLResponse,
  endpoint: string,
  shopDomain: string,
  fetchedAt: string,
): { page: CatalogSnapshotPage; ref: SnapshotRef } {
  const contentHash = sha256Hex(response.rawText);
  const storageRef = `shopify-catalog://${shopDomain}/${contentHash}.json`;
  const page: CatalogSnapshotPage = {
    url: endpoint,
    contentHash,
    fetchedAt,
    storageRef,
    raw: response.rawText,
  };
  return { page, ref: snapshotRefOf(page) };
}

function snapshotRefOf(page: CatalogSnapshotPage): SnapshotRef {
  return SnapshotRefSchema.parse({
    url: page.url,
    content_hash: page.contentHash,
    fetched_at: page.fetchedAt,
    storage_ref: page.storageRef,
  });
}

function nextPageCursor(
  pageInfo: { hasNextPage: boolean; endCursor: string | null },
  what: string,
): string | null {
  if (!pageInfo.hasNextPage) return null;
  if (pageInfo.endCursor === null) {
    throw new ShopifyConnectorError(
      "graphql_error",
      `${what} pageInfo hasNextPage is true without an endCursor`,
    );
  }
  return pageInfo.endCursor;
}

function requireDataObject(response: GraphQLResponse): Record<string, unknown> {
  return requireObject(response.data, "response.data");
}

function requireObject(value: unknown, what: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new ShopifyConnectorError("graphql_error", `${what} is not an object`);
  }
  return value as Record<string, unknown>;
}

function requireString(record: Record<string, unknown>, field: string, what: string): string {
  const value = stringField(record, field);
  if (value === undefined) {
    throw new ShopifyConnectorError("graphql_error", `${what} carries no usable ${field}`);
  }
  return value;
}

function stringField(record: Record<string, unknown>, field: string): string | undefined {
  const value = record[field];
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function requireConnection(
  value: unknown,
  what: string,
): ShopifyConnection<Record<string, unknown>> {
  const connection = requireObject(value, what);
  if (!Array.isArray(connection.nodes)) {
    throw new ShopifyConnectorError("graphql_error", `${what} carries no nodes array`);
  }
  const pageInfo = requireObject(connection.pageInfo, `${what}.pageInfo`);
  if (typeof pageInfo.hasNextPage !== "boolean") {
    throw new ShopifyConnectorError(
      "graphql_error",
      `${what}.pageInfo.hasNextPage is not a boolean`,
    );
  }
  const endCursor = pageInfo.endCursor;
  return {
    nodes: connection.nodes.map((node, index) => requireObject(node, `${what}.nodes[${index}]`)),
    pageInfo: {
      hasNextPage: pageInfo.hasNextPage,
      endCursor: typeof endCursor === "string" && endCursor !== "" ? endCursor : null,
    },
  };
}

function firstValidUrl(candidates: (string | undefined)[]): string | undefined {
  for (const candidate of candidates) {
    if (candidate !== undefined && UrlSchema.safeParse(candidate).success) {
      return candidate;
    }
  }
  return undefined;
}

/** Code-point-safe truncation (no split surrogate pairs). */
function truncateCodePoints(value: string, maxCodePoints: number): string {
  const codePoints = [...value];
  return codePoints.length > maxCodePoints
    ? codePoints.slice(0, maxCodePoints).join("")
    : value;
}

interface SafeParseFailure {
  success: false;
  error: { issues: { path: PropertyKey[]; message: string }[] };
}
interface SafeParseSuccess<T> {
  success: true;
  data: T;
}

/** Validates a mapped record against a core-schema Zod schema, naming the
 * subject and every issue path in the failure — mapping bugs stay auditable. */
function parseOrThrow<T>(
  schema: { safeParse: (value: unknown) => SafeParseSuccess<T> | SafeParseFailure },
  record: unknown,
  what: string,
): T {
  const parsed = schema.safeParse(record);
  if (parsed.success) return parsed.data;
  const detail = parsed.error.issues
    .map((issue) => `${issue.path.map(String).join(".") || "<root>"}: ${issue.message}`)
    .join("; ");
  throw new Error(`mapped ${what} violates its core-schema contract — ${detail}`);
}
