import { describe, expect, it } from "vitest";

import { AdminGraphQLClient } from "../src/admin-api.js";
import type { ShopifyConnectorError } from "../src/errors.js";
import { isShopifyConnectorError } from "../src/errors.js";
import { queuedGraphQLPost, TEST_ADMIN_CONFIG } from "./helpers.js";

function clientWith(transport: ReturnType<typeof queuedGraphQLPost>): AdminGraphQLClient {
  return new AdminGraphQLClient(TEST_ADMIN_CONFIG, { post: transport.post });
}

describe("AdminGraphQLClient", () => {
  it("posts the query and variables with the access token header", async () => {
    const transport = queuedGraphQLPost([
      { text: JSON.stringify({ data: { shop: { name: "Acme" } } }) },
    ]);
    const client = clientWith(transport);

    const response = await client.request("query ShopResource { shop { name } }");

    expect(response.data).toEqual({ shop: { name: "Acme" } });
    expect(transport.calls).toHaveLength(1);
    expect(transport.calls[0]?.url).toBe(
      `https://${TEST_ADMIN_CONFIG.shopDomain}/admin/api/${TEST_ADMIN_CONFIG.apiVersion}/graphql.json`,
    );
    expect(transport.calls[0]?.headers["X-Shopify-Access-Token"]).toBe(
      TEST_ADMIN_CONFIG.accessToken,
    );
    expect(transport.calls[0]?.headers["Content-Type"]).toBe("application/json");
    const body = transport.calls[0]?.body as { query: string; variables?: unknown };
    expect(body.query).toBe("query ShopResource { shop { name } }");
    // No variables passed → no variables field in the request body.
    expect(body.variables).toBeUndefined();
  });

  it("includes variables when provided", async () => {
    const transport = queuedGraphQLPost([{ text: JSON.stringify({ data: {} }) }]);
    const client = clientWith(transport);
    await client.request("query X($first: Int!) { x(first: $first) }", { first: 10 });
    const body = transport.calls[0]?.body as { variables: { first: number } };
    expect(body.variables).toEqual({ first: 10 });
  });

  it("surfaces GraphQL application errors as graphql_error", async () => {
    const transport = queuedGraphQLPost([
      {
        text: JSON.stringify({
          errors: [
            {
              message: "Field 'products' doesn't exist on type 'QueryRoot'",
              extensions: { code: "undefinedField" },
            },
          ],
        }),
      },
    ]);
    const client = clientWith(transport);
    try {
      await client.request("query { products { nodes { id } } }");
      expect.unreachable("expected graphql_error");
    } catch (error) {
      expect(isShopifyConnectorError(error)).toBe(true);
      expect((error as ShopifyConnectorError).code).toBe("graphql_error");
      expect((error as ShopifyConnectorError).message).toMatch(/doesn't exist/);
      expect((error as ShopifyConnectorError).message).toMatch(/undefinedField/);
    }
  });

  it("classifies HTTP 401 as token_expired", async () => {
    const transport = queuedGraphQLPost([{ status: 401, text: "Unauthorized" }]);
    const client = clientWith(transport);
    try {
      await client.request("query { shop { name } }");
      expect.unreachable("expected token_expired");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("token_expired");
    }
  });

  it("classifies HTTP 429 as graphql_error and surfaces Retry-After", async () => {
    const transport = queuedGraphQLPost([
      { status: 429, text: "Too Many Requests", headers: { "retry-after": "2.0" } },
    ]);
    const client = clientWith(transport);
    try {
      await client.request("query { shop { name } }");
      expect.unreachable("expected graphql_error");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("graphql_error");
      expect((error as ShopifyConnectorError).message).toMatch(/429/);
      expect((error as ShopifyConnectorError).message).toMatch(/Retry-After: 2\.0s/);
    }
  });

  it("classifies a scope shortfall (403) as graphql_error, not token_expired", async () => {
    const transport = queuedGraphQLPost([{ status: 403, text: "Forbidden" }]);
    const client = clientWith(transport);
    try {
      await client.request("query { shop { name } }");
      expect.unreachable("expected graphql_error");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("graphql_error");
      expect((error as ShopifyConnectorError).message).toMatch(/403/);
    }
  });

  it("rejects non-JSON success bodies as graphql_error", async () => {
    const transport = queuedGraphQLPost([{ status: 200, text: "<html>gateway</html>" }]);
    const client = clientWith(transport);
    try {
      await client.request("query { shop { name } }");
      expect.unreachable("expected graphql_error");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("graphql_error");
      expect((error as ShopifyConnectorError).message).toMatch(/not valid JSON/);
    }
  });

  it("rejects a 200 response without a data key", async () => {
    const transport = queuedGraphQLPost([{ status: 200, text: JSON.stringify({}) }]);
    const client = clientWith(transport);
    try {
      await client.request("query { shop { name } }");
      expect.unreachable("expected graphql_error");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("graphql_error");
      expect((error as ShopifyConnectorError).message).toMatch(/no data/);
    }
  });

  it("rejects malformed client config before any request", () => {
    expect(() => new AdminGraphQLClient({ ...TEST_ADMIN_CONFIG, shopDomain: "not-a-shopify-domain" })).toThrowError(
      /myshopify\.com/,
    );
    expect(() => new AdminGraphQLClient({ ...TEST_ADMIN_CONFIG, accessToken: "" })).toThrowError(
      /access token/,
    );
    expect(() => new AdminGraphQLClient({ ...TEST_ADMIN_CONFIG, apiVersion: "latest" })).toThrowError(
      /YYYY-MM/,
    );
  });
});
