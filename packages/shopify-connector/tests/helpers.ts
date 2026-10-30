/**
 * Test-side independent re-implementation of the documented Shopify signing
 * algorithms plus shared fixture config. Deliberately does not reuse the
 * package's own HMAC helpers for OAuth callbacks: tests cross-check the
 * package's crypto against a from-the-docs implementation.
 */

import { createHmac } from "node:crypto";

import type { ShopifyOAuthConfig } from "../src/oauth.js";

export const TEST_STORE = {
  storeId: "store_fixture_1",
  clientId: "client_fixture_123",
  clientSecret: "fixture_client_secret_do_not_ship",
  shopDomain: "acme-fixtures.myshopify.com",
  redirectUri: "https://app.intentvisible.test/v1/install/callback",
} satisfies ShopifyOAuthConfig;

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
