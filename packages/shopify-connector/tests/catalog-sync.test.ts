import { describe, expect, it } from "vitest";

import { syncCatalog } from "../src/catalog-sync.js";
import type { ShopifyConnectorError } from "../src/errors.js";
import { isShopifyConnectorError } from "../src/errors.js";
import { AdminGraphQLClient } from "../src/admin-api.js";
import {
  queuedGraphQLPost,
  readFixture,
  TEST_ADMIN_CONFIG,
  type GraphQLResponseFixture,
} from "./helpers.js";

/** Fixed clock so snapshot refs and generated_at are deterministic. */
const NOW = () => new Date("2026-10-30T12:00:00.000Z");

function fixtureText(name: string): string {
  return JSON.stringify(readFixture(name));
}

function syncWithPages(pages: GraphQLResponseFixture[]): ReturnType<typeof queuedGraphQLPost> {
  return queuedGraphQLPost(pages);
}

function fixtureSync(
  order: string[] = ["shop-resource.json", "catalog-page-1.json", "variant-overflow.json", "catalog-page-2.json"],
): { transport: ReturnType<typeof queuedGraphQLPost>; client: AdminGraphQLClient } {
  const transport = syncWithPages(order.map((name) => ({ text: fixtureText(name) })));
  return { transport, client: new AdminGraphQLClient(TEST_ADMIN_CONFIG, { post: transport.post }) };
}

describe("syncCatalog (fixtures only)", () => {
  it("maps the full fixture catalog into core-schema-valid profiles", async () => {
    const { client } = fixtureSync();

    const result = await syncCatalog(client, { pageSize: 2, variantsPageSize: 2, now: NOW });

    // Brand profile from the shop resource.
    expect(result.brand.brand_id).toBe("brand_acme_fixtures");
    expect(result.brand.name).toBe("Acme Fixtures Outfitters");
    expect(result.brand.domain).toBe("acme-fixtures.myshopify.com");
    expect(result.brand.evidence_urls).toEqual([
      "https://acme-fixtures.myshopify.com",
      "https://www.acme-fixtures-outfitters.com",
    ]);
    // Every page fetched backs the brand: shop + 2 product pages + overflow.
    expect(result.brand.snapshot_refs).toHaveLength(4);
    expect(result.brand.generation_method).toBe("deterministic_extraction");

    // Three products across two pages, with the variant overflow merged.
    expect(result.products).toHaveLength(3);
    expect(result.failures).toEqual([]);

    const tungsten = result.products.find((p) => p.product_id === "product_98765432100");
    expect(tungsten?.name).toBe("Tungsten Weighted Blanket");
    expect(tungsten?.url).toBe(
      "https://www.acme-fixtures-outfitters.com/products/tungsten-weighted-blanket",
    );
    expect(tungsten?.features).toEqual(["Size", "Fill Weight"]);
    expect(tungsten?.skus).toHaveLength(2);
    expect(tungsten?.skus[0]).toMatchObject({
      sku_id: "sku_111000111",
      name: "Queen / 15 lbs",
      price: { amount: 129, currency: "USD" },
    });
    // Product price = cheapest variant.
    expect(tungsten?.price).toEqual({ amount: 129, currency: "USD" });

    const merino = result.products.find((p) => p.product_id === "product_98765432101");
    // 2 first-page variants + 1 overflow variant = 3 SKUs.
    expect(merino?.skus).toHaveLength(3);
    expect(merino?.skus.map((s) => s.sku_id)).toEqual([
      "sku_222000111",
      "sku_222000222",
      "sku_222000333",
    ]);

    // Unpublished product: PDP falls back to the primary-domain origin.
    const liner = result.products.find((p) => p.product_id === "product_98765432102");
    expect(liner?.url).toBe(
      "https://www.acme-fixtures-outfitters.com/products/wool-envelope-sleeping-bag-liner",
    );

    // Every product profile is core-schema-valid (the mapper already
    // validated via ProductProfileSchema; the refs carry the page evidence).
    for (const product of result.products) {
      expect(product.snapshot_refs.length).toBeGreaterThanOrEqual(1);
      expect(product.generation_method).toBe("deterministic_extraction");
      expect(product.generated_at).toBe("2026-10-30T12:00:00.000Z");
    }
  });

  it("exercises pagination across the fixture pages in order", async () => {
    const { transport, client } = fixtureSync();
    await syncCatalog(client, { pageSize: 2, variantsPageSize: 2, now: NOW });

    expect(transport.calls).toHaveLength(4);
    const queries = transport.calls.map(
      (call) => (call.body as { query: string }).query.replace(/\s+/g, " ").trim(),
    );
    expect(queries[0]).toMatch(/query ShopResource/);
    expect(queries[1]).toMatch(/query CatalogPage/);
    expect(queries[2]).toMatch(/query ProductVariantsPage/);
    expect(queries[3]).toMatch(/query CatalogPage/);

    const firstPageVariables = transport.calls[1]?.body as {
      variables: { first: number; variantsFirst: number; after?: string };
    };
    expect(firstPageVariables.variables).toEqual({
      first: 2,
      after: null,
      variantsFirst: 2,
    });
    const secondPageVariables = transport.calls[3]?.body as {
      variables: { after: string | null };
    };
    expect(secondPageVariables.variables.after).toBe("cursor-page-1");
  });

  it("reports per-product failures without losing the rest of the catalog", async () => {
    // Page 1 with a product missing its handle — mapping throws, the sync
    // continues; the failing product lands in `failures`.
    const page = JSON.parse(fixtureText("catalog-page-1.json")) as {
      data: { products: { nodes: Record<string, unknown>[] } };
    };
    delete page.data.products.nodes[0]?.["handle"];
    const transport = syncWithPages([
      { text: fixtureText("shop-resource.json") },
      { text: JSON.stringify(page) },
      { text: fixtureText("variant-overflow.json") }, // Merino's overflow variants
      { text: fixtureText("catalog-page-2.json") },
    ]);
    const client = new AdminGraphQLClient(TEST_ADMIN_CONFIG, { post: transport.post });

    const result = await syncCatalog(client, { pageSize: 2, variantsPageSize: 2, now: NOW });

    expect(result.products).toHaveLength(2); // Merino and the liner survived
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.shopifyProductId).toBe("product_98765432100");
    expect(result.failures[0]?.reason).toMatch(/handle/);
  });

  it("surfaces unparseable variant prices as soft issues on a mapped product", async () => {
    const page = JSON.parse(fixtureText("catalog-page-2.json")) as {
      data: { products: { nodes: { variants: { nodes: { price: { amount: string } }[] } }[] } };
    };
    page.data.products.nodes[0]!.variants.nodes[0]!.price.amount = "not-a-number";
    const transport = syncWithPages([
      { text: fixtureText("shop-resource.json") },
      { text: JSON.stringify(page) },
    ]);
    const client = new AdminGraphQLClient(TEST_ADMIN_CONFIG, { post: transport.post });

    const result = await syncCatalog(client, { pageSize: 2, variantsPageSize: 2, now: NOW });

    expect(result.products).toHaveLength(1);
    expect(result.products[0]?.price).toBeUndefined(); // no variant price to take
    expect(result.products[0]?.skus[0]?.price).toBeUndefined();
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0]?.reason).toMatch(/parseable price/);
  });

  it("rejects a shop resource whose myshopifyDomain does not match the config", async () => {
    const shop = JSON.parse(fixtureText("shop-resource.json")) as {
      data: { shop: { myshopifyDomain: string } };
    };
    shop.data.shop.myshopifyDomain = "other-store.myshopify.com";
    const transport = syncWithPages([{ text: JSON.stringify(shop) }]);
    const client = new AdminGraphQLClient(TEST_ADMIN_CONFIG, { post: transport.post });
    try {
      await syncCatalog(client, { now: NOW });
      expect.unreachable("expected graphql_error");
    } catch (error) {
      expect(isShopifyConnectorError(error)).toBe(true);
      expect((error as ShopifyConnectorError).code).toBe("graphql_error");
      expect((error as ShopifyConnectorError).message).toMatch(
        /does not match the configured store domain/,
      );
    }
  });

  it("syncs an empty catalog into a valid brand profile with no products", async () => {
    const transport = syncWithPages([
      { text: fixtureText("shop-resource.json") },
      {
        text: JSON.stringify({
          data: { products: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } } },
        }),
      },
    ]);
    const client = new AdminGraphQLClient(TEST_ADMIN_CONFIG, { post: transport.post });

    const result = await syncCatalog(client, { now: NOW });

    expect(result.products).toEqual([]);
    expect(result.failures).toEqual([]);
    expect(result.pages).toHaveLength(2); // shop + one empty product page
    expect(result.brand.brand_id).toBe("brand_acme_fixtures");
  });

  it("propagates typed transport failures (token rejected)", async () => {
    const transport = syncWithPages([{ status: 401, text: "Unauthorized" }]);
    const client = new AdminGraphQLClient(TEST_ADMIN_CONFIG, { post: transport.post });
    await expect(syncCatalog(client, { now: NOW })).rejects.toMatchObject({ code: "token_expired" });
  });

  it("rejects out-of-range page sizes before any request", async () => {
    const { client } = fixtureSync();
    await expect(syncCatalog(client, { pageSize: 251, now: NOW })).rejects.toThrowError(
      /between 1 and 250/,
    );
    await expect(syncCatalog(client, { variantsPageSize: 0, now: NOW })).rejects.toThrowError(
      /between 1 and 250/,
    );
  });
});

describe("brandIdFromShopDomain", () => {
  it("derives the slug from the myshopify subdomain", async () => {
    const { brandIdFromShopDomain } = await import("../src/catalog-sync.js");
    expect(brandIdFromShopDomain("acme-fixtures.myshopify.com")).toBe("brand_acme_fixtures");
    expect(() => brandIdFromShopDomain("---.myshopify.com")).toThrowError(/brand id/);
  });
});
