/**
 * Thin Admin GraphQL client for one store — the connector's only Admin API
 * surface (spec D1). Posts `{ query, variables }` JSON, classifies every
 * failure into the typed boundary errors, and hands the RAW response body
 * back so callers can persist content-hashed snapshot pages. No SDK, no
 * retry policy: 401 is `token_expired` (re-authorization required), 429 is
 * `graphql_error` carrying the Retry-After value when Shopify sends one,
 * and everything else in-flight is `graphql_error`.
 */

import { ShopifyConnectorError } from "./errors.js";
import { assertMyShopifyDomain } from "./shop-domain.js";

/** Per-store Admin API configuration. accessToken is a credential: callers
 * hand it in per call; it is never logged and never appears in errors. */
export interface AdminApiConfig {
  /** IntentVisible store id (caller-owned key), threaded into typed errors. */
  readonly storeId: string;
  readonly shopDomain: string;
  /** The store's offline Admin access token (shpat_…) from the OAuth exchange. */
  readonly accessToken: string;
  /** Pinned Admin API version, e.g. "2026-10" (YYYY-MM quarterly releases). */
  readonly apiVersion: string;
}

/**
 * Injectable GraphQL transport — mirrors fetch's shape so callers can log
 * without credentials. Response headers arrive lowercased (Node's Headers).
 */
export type GraphQLPost = (
  url: string,
  init: { headers: Record<string, string>; body: string },
) => Promise<{ status: number; text: string; headers: Record<string, string> }>;

export interface GraphQLResponse {
  /** The `data` payload — an object per the Admin schema. */
  readonly data: unknown;
  /** The raw response body — persisted verbatim as the snapshot page. */
  readonly rawText: string;
}

export class AdminGraphQLClient {
  readonly storeId: string;
  readonly shopDomain: string;
  readonly apiVersion: string;
  private readonly accessToken: string;
  private readonly post: GraphQLPost;

  constructor(
    config: AdminApiConfig,
    deps: { post?: GraphQLPost } = {},
  ) {
    assertMyShopifyDomain(config.shopDomain);
    if (config.accessToken === "") {
      throw new Error("Admin API config carries an empty access token");
    }
    if (!/^\d{4}-\d{2}$/.test(config.apiVersion)) {
      throw new Error(`Admin API version must be YYYY-MM, got "${config.apiVersion}"`);
    }
    this.storeId = config.storeId;
    this.shopDomain = config.shopDomain;
    this.apiVersion = config.apiVersion;
    this.accessToken = config.accessToken;
    this.post = deps.post ?? defaultGraphQLPost;
  }

  /** The GraphQL endpoint these requests go to — also the snapshot `url`. */
  get endpoint(): string {
    return `https://${this.shopDomain}/admin/api/${this.apiVersion}/graphql.json`;
  }

  /**
   * Runs one GraphQL request. Success means HTTP 2xx AND no `errors` array
   * in the body (GraphQL returns 200 for application errors — shopify.dev,
   * Admin GraphQL "Errors" — so the errors field is checked explicitly).
   */
  async request(query: string, variables?: Record<string, unknown>): Promise<GraphQLResponse> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Shopify-Access-Token": this.accessToken,
    };
    const body = JSON.stringify({ query, ...(variables ? { variables } : {}) });

    let status: number;
    let text: string;
    let responseHeaders: Record<string, string>;
    try {
      ({ status, text, headers: responseHeaders } = await this.post(this.endpoint, {
        headers,
        body,
      }));
    } catch (cause) {
      throw new ShopifyConnectorError(
        "graphql_error",
        `Admin GraphQL request failed: ${causeMessage(cause)}`,
        this.errorContext(),
      );
    }

    if (status === 401) {
      throw new ShopifyConnectorError(
        "token_expired",
        "Admin API rejected the stored access token (HTTP 401) — re-authorization required",
        this.errorContext(),
      );
    }
    if (status === 429) {
      const retryAfter = headerValue(responseHeaders, "retry-after");
      throw new ShopifyConnectorError(
        "graphql_error",
        `Admin API rate limited (HTTP 429)${retryAfter === undefined ? "" : ` — Retry-After: ${retryAfter}s`}`,
        this.errorContext(),
      );
    }
    if (status < 200 || status >= 300) {
      throw new ShopifyConnectorError(
        "graphql_error",
        `Admin GraphQL request failed with HTTP ${status}: ${truncateForMessage(text)}`,
        this.errorContext(),
      );
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      throw new ShopifyConnectorError(
        "graphql_error",
        "Admin GraphQL response is not valid JSON",
        { ...this.errorContext(), cause },
      );
    }
    if (typeof parsed !== "object" || parsed === null) {
      throw new ShopifyConnectorError(
        "graphql_error",
        "Admin GraphQL response is not a JSON object",
        this.errorContext(),
      );
    }
    const record = parsed as Record<string, unknown>;
    if (record.errors !== undefined) {
      throw new ShopifyConnectorError(
        "graphql_error",
        `Admin GraphQL response carries errors: ${describeGraphQLErrors(record.errors)}`,
        this.errorContext(),
      );
    }
    if (record.data === undefined) {
      throw new ShopifyConnectorError(
        "graphql_error",
        "Admin GraphQL response carries no data",
        this.errorContext(),
      );
    }
    return { data: record.data, rawText: text };
  }

  private errorContext(): { storeId: string; shopDomain: string } {
    return { storeId: this.storeId, shopDomain: this.shopDomain };
  }
}

/** Default transport: global fetch, headers object lowercased. */
function defaultGraphQLPost(
  url: string,
  init: { headers: Record<string, string>; body: string },
): Promise<{ status: number; text: string; headers: Record<string, string> }> {
  return fetch(url, { method: "POST", headers: init.headers, body: init.body }).then(
    async (response) => ({
      status: response.status,
      text: await response.text(),
      headers: Object.fromEntries(response.headers.entries()),
    }),
  );
}

/** Case-insensitive single-value header lookup (HTTP/2 lowercases names). */
function headerValue(headers: Record<string, string>, name: string): string | undefined {
  return headers[name] ?? headers[name.toLowerCase()];
}

/**
 * Bounds GraphQL error detail to a message: the first error's message plus
 * its extension code when present ("THROTTLED", "undefinedField", …).
 */
function describeGraphQLErrors(errors: unknown): string {
  if (!Array.isArray(errors) || errors.length === 0) {
    return "empty errors array";
  }
  const first = errors[0];
  if (typeof first !== "object" || first === null) {
    return String(first);
  }
  const entry = first as Record<string, unknown>;
  const message = typeof entry.message === "string" ? entry.message : JSON.stringify(entry);
  const code = (entry.extensions as Record<string, unknown> | undefined)?.code;
  return typeof code === "string" ? `${message} (code: ${code})` : message;
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Bounds error text from a remote response — never echoes more than a snippet. */
function truncateForMessage(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 200 ? `${singleLine.slice(0, 200)}…` : singleLine;
}
