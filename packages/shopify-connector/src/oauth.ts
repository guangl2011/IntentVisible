/**
 * Shopify OAuth 2.0 authorization code grant for standalone apps — install
 * URL construction, callback verification, and token exchange.
 *
 * Flow per current Shopify docs (shopify.dev "Installation during
 * authorization code grant" + "Access tokens", verified 2026-10-30):
 *  1. Redirect the merchant to {shop}/admin/oauth/authorize with client_id,
 *     scope, redirect_uri, and a single-use `state` nonce. The caller (API
 *     layer) stores the nonce per install attempt and consumes it on first
 *     use; this package never keeps state.
 *  2. On callback: validate `state` against the stored nonce (a consumed
 *     or missing nonce means the callback is a replay → state_mismatch),
 *     verify the callback HMAC (hex SHA-256 over the sorted key=value
 *     pairs, `hmac` excluded, constant-time compare), check the returned
 *     shop matches the store that began the install, then exchange the
 *     code for an OFFLINE access token (the default grant — no expiry).
 *
 * Least privilege is structural: the connector always requests exactly
 * LEAST_PRIVILEGE_SCOPES and has no parameter that can widen them.
 */

import { randomUUID } from "node:crypto";

import { hmacSha256Hex, timingSafeEqualStrings } from "./crypto.js";
import { ShopifyConnectorError } from "./errors.js";
import { LEAST_PRIVILEGE_SCOPE_PARAM, parseGrantedScopes } from "./scopes.js";
import { assertMyShopifyDomain, isMyShopifyDomain } from "./shop-domain.js";

/** Per-store OAuth configuration. clientSecret is a credential: callers
 * hand it in per call; it is never logged and never appears in error
 * messages. */
export interface ShopifyOAuthConfig {
  /** IntentVisible store id (caller-owned key), threaded into typed errors. */
  readonly storeId: string;
  readonly clientId: string;
  readonly clientSecret: string;
  /** The store's {slug}.myshopify.com domain — the explicit store identity. */
  readonly shopDomain: string;
  /** The app's registered callback URL (must match the Partner Dashboard exactly). */
  readonly redirectUri: string;
}

export interface InstallUrl {
  readonly installUrl: string;
  /** Single-use nonce — store it per install attempt, consume on first verified callback. */
  readonly state: string;
}

/**
 * Builds the merchant-facing authorize URL with the locked scope set.
 * `state` is generated (crypto UUID) when omitted; pass one explicitly for
 * deterministic tests.
 */
export function buildInstallUrl(config: ShopifyOAuthConfig, state?: string): InstallUrl {
  assertMyShopifyDomain(config.shopDomain);
  const authorize = new URL(`https://${config.shopDomain}/admin/oauth/authorize`);
  authorize.searchParams.set("client_id", config.clientId);
  authorize.searchParams.set("scope", LEAST_PRIVILEGE_SCOPE_PARAM);
  authorize.searchParams.set("redirect_uri", config.redirectUri);
  const nonce = state ?? randomUUID();
  authorize.searchParams.set("state", nonce);
  return { installUrl: authorize.toString(), state: nonce };
}

/** The callback request's query parameters, values URL-decoded (as Node/Fastify deliver them). */
export type OAuthCallbackQuery = Readonly<Record<string, string>>;

export interface VerifyCallbackInput {
  readonly query: OAuthCallbackQuery;
  /**
   * The single-use nonce stored when the install began. `undefined` means
   * the caller holds no pending nonce for this store — the install was
   * never started or the nonce was already consumed — so the callback is a
   * replay and must be rejected.
   */
  readonly expectedState: string | undefined;
}

export interface VerifiedOAuthCallback {
  /** The authorization code — exchange it immediately via exchangeCodeForToken. */
  readonly code: string;
  readonly shopDomain: string;
  readonly state: string;
}

/**
 * Verifies an OAuth callback: state first (docs order), then HMAC, then
 * the shop domain, then code presence. Nothing here or in the exchange is
 * safe to do before these checks pass.
 */
export function verifyOAuthCallback(
  config: ShopifyOAuthConfig,
  input: VerifyCallbackInput,
): VerifiedOAuthCallback {
  const { query, expectedState } = input;

  const returnedState = query.state;
  if (expectedState === undefined) {
    throw new ShopifyConnectorError(
      "state_mismatch",
      "no pending OAuth state is stored for this store — the install was never started or the nonce was already consumed (possible replay)",
      errorContext(config),
    );
  }
  if (returnedState === undefined) {
    throw new ShopifyConnectorError(
      "state_mismatch",
      "callback carries no state parameter",
      errorContext(config),
    );
  }
  if (returnedState !== expectedState) {
    throw new ShopifyConnectorError(
      "state_mismatch",
      "callback state does not match the stored nonce",
      errorContext(config),
    );
  }

  const providedHmac = query.hmac;
  if (providedHmac === undefined) {
    throw new ShopifyConnectorError(
      "hmac_rejected",
      "callback carries no hmac parameter",
      errorContext(config),
    );
  }
  const expectedHmac = hmacSha256Hex(
    canonicalCallbackMessage(query),
    config.clientSecret,
  );
  if (!timingSafeEqualStrings(expectedHmac, providedHmac)) {
    throw new ShopifyConnectorError(
      "hmac_rejected",
      "callback hmac does not match the query parameters — the callback was tampered with or was not sent by Shopify",
      errorContext(config),
    );
  }

  // A valid HMAC proves Shopify signed this callback, but not that it is
  // for THIS install attempt — the shop must match the store that began it.
  const returnedShop = query.shop;
  if (
    returnedShop === undefined ||
    !isMyShopifyDomain(returnedShop) ||
    returnedShop !== config.shopDomain
  ) {
    throw new ShopifyConnectorError(
      "state_mismatch",
      "callback shop domain does not match the store that began this install attempt",
      errorContext(config),
    );
  }

  const code = query.code;
  if (code === undefined) {
    throw new ShopifyConnectorError(
      "oauth_failed",
      "signed callback carries no authorization code — the merchant may have declined the consent screen",
      errorContext(config),
    );
  }
  return { code, shopDomain: returnedShop, state: returnedState };
}

/**
 * The docs' canonical message: every query parameter except `hmac` (and the
 * legacy `signature`), sorted by parameter name, joined as key=value with "&".
 */
function canonicalCallbackMessage(query: OAuthCallbackQuery): string {
  return Object.entries(query)
    .filter(([key]) => key !== "hmac" && key !== "signature")
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, value]) => `${key}=${value}`)
    .join("&");
}

/**
 * Exchanges the authorization code for an offline access token
 * (POST /admin/oauth/access_token with client_id, client_secret, code).
 * The request body carries the client secret — the injected transport
 * returns only status/text so callers can log URLs and statuses without
 * ever seeing the credential again.
 */
export interface OfflineAccessToken {
  readonly accessToken: string;
  /** Scopes the store actually granted, parsed from the response's `scope` field. */
  readonly scopes: string[];
}

export type PostJson = (
  url: string,
  body: string,
) => Promise<{ status: number; text: string }>;

export interface OAuthTokenExchangeDeps {
  /** Injectable transport (defaults to global fetch) — fixture tests use no network. */
  readonly postJson?: PostJson;
}

export async function exchangeCodeForToken(
  config: ShopifyOAuthConfig,
  code: string,
  deps: OAuthTokenExchangeDeps = {},
): Promise<OfflineAccessToken> {
  const postJson = deps.postJson ?? defaultPostJson;
  const url = `https://${config.shopDomain}/admin/oauth/access_token`;
  const body = JSON.stringify({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    code,
  });

  let response: { status: number; text: string };
  try {
    response = await postJson(url, body);
  } catch (cause) {
    throw new ShopifyConnectorError(
      "oauth_failed",
      `token exchange request to ${url} failed: ${causeMessage(cause)}`,
      { ...errorContext(config), cause },
    );
  }

  if (response.status !== 200) {
    throw new ShopifyConnectorError(
      "oauth_failed",
      `token exchange rejected with HTTP ${response.status}: ${truncateForMessage(response.text)}`,
      errorContext(config),
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(response.text);
  } catch (cause) {
    throw new ShopifyConnectorError(
      "oauth_failed",
      "token exchange response is not valid JSON",
      { ...errorContext(config), cause },
    );
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new ShopifyConnectorError(
      "oauth_failed",
      "token exchange response is not a JSON object",
      errorContext(config),
    );
  }
  const record = parsed as Record<string, unknown>;
  const accessToken = record.access_token;
  if (typeof accessToken !== "string" || accessToken === "") {
    throw new ShopifyConnectorError(
      "oauth_failed",
      "token exchange response carries no access_token",
      errorContext(config),
    );
  }
  const scope = record.scope;
  return {
    accessToken,
    scopes: parseGrantedScopes(typeof scope === "string" ? scope : ""),
  };
}

/** Default transport: global fetch with a JSON content type. */
function defaultPostJson(url: string, body: string): Promise<{ status: number; text: string }> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body,
  }).then(async (response) => ({ status: response.status, text: await response.text() }));
}

function errorContext(config: ShopifyOAuthConfig): { storeId: string; shopDomain: string } {
  return { storeId: config.storeId, shopDomain: config.shopDomain };
}

function causeMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/** Bounds error text from a remote response — never echoes more than a snippet. */
function truncateForMessage(text: string): string {
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 200 ? `${singleLine.slice(0, 200)}…` : singleLine;
}
