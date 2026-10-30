/**
 * Test-side independent re-implementation of the documented Shopify signing
 * algorithms plus shared fixture config. Deliberately does not reuse the
 * package's own HMAC helpers for OAuth callbacks: tests cross-check the
 * package's crypto against a from-the-docs implementation.
 */

import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";

import type { AdminApiConfig, GraphQLPost } from "../src/admin-api.js";
import type { ShopifyOAuthConfig } from "../src/oauth.js";

export const TEST_STORE = {
  storeId: "store_fixture_1",
  clientId: "client_fixture_123",
  clientSecret: "fixture_client_secret_do_not_ship",
  shopDomain: "acme-fixtures.myshopify.com",
  redirectUri: "https://app.intentvisible.test/v1/install/callback",
} satisfies ShopifyOAuthConfig;

export const TEST_ADMIN_CONFIG = {
  storeId: "store_fixture_1",
  shopDomain: "acme-fixtures.myshopify.com",
  accessToken: "shpat_fixture_token",
  apiVersion: "2026-10",
} satisfies AdminApiConfig;

/**
 * The docs' OAuth callback HMAC: every query parameter except `hmac`
 * (and the legacy `signature`), sorted by parameter name, joined as
 * key=value with "&", hex-encoded HMAC-SHA256 with the client secret.
 */
export function signCallbackQuery(
  query: Record<string, string>,
  clientSecret: string,
): string {
  const message = Object.entries(query)
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
  return createHmac("sha256", clientSecret).update(message).digest("hex");
}

/** Loads a recorded Admin GraphQL response fixture. */
export function readFixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8")) as unknown;
}

export interface GraphQLResponseFixture {
  readonly status?: number;
  readonly text: string;
  readonly headers?: Record<string, string>;
}

/**
 * A GraphQLPost that answers from a FIFO queue of fixture responses and
 * records every call (url, headers, parsed body) — an over-run call fails
 * the test loudly instead of hanging or looping.
 */
export function queuedGraphQLPost(responses: GraphQLResponseFixture[]): {
  post: GraphQLPost;
  calls: { url: string; headers: Record<string, string>; body: unknown }[];
} {
  const calls: { url: string; headers: Record<string, string>; body: unknown }[] = [];
  const queue = [...responses];
  const post: GraphQLPost = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body) as unknown });
    const next = queue.shift();
    if (next === undefined) {
      throw new Error(`unexpected GraphQL call #${calls.length} — no fixture response queued`);
    }
    return { status: next.status ?? 200, text: next.text, headers: next.headers ?? {} };
  };
  return { post, calls };
}
