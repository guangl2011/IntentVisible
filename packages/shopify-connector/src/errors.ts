/**
 * Typed error vocabulary for the Shopify boundary (spec D1). Every wire
 * rejection maps to exactly one code so callers (API routes, job runners)
 * can branch without string-matching messages:
 *
 * - hmac_rejected  — a signature check failed (OAuth callback or webhook)
 * - state_mismatch — OAuth state nonce missing, consumed, or mismatched
 * - token_expired  — the Admin API rejected the stored access token (401)
 * - graphql_error  — any other Admin GraphQL request failure (status,
 *                    transport, GraphQL errors array, unexpected shape)
 * - oauth_failed   — the authorization-code exchange itself was rejected
 *
 * `oauth_failed` is additive: the spec's four codes stay exactly as named;
 * exchange rejections (invalid/used authorization code) are none of those
 * four and are never mislabeled onto one.
 *
 * Caller invariant violations (malformed config, impossible API shapes)
 * throw plain Errors — developer bugs, not wire rejections.
 */

export type ShopifyConnectorErrorCode =
  | "hmac_rejected"
  | "state_mismatch"
  | "token_expired"
  | "graphql_error"
  | "oauth_failed";

export interface ShopifyConnectorErrorOptions {
  /** IntentVisible store id for store-scoped logs; never a secret. */
  readonly storeId?: string;
  readonly shopDomain?: string;
  readonly cause?: unknown;
}

export class ShopifyConnectorError extends Error {
  readonly code: ShopifyConnectorErrorCode;
  readonly storeId: string | undefined;
  readonly shopDomain: string | undefined;

  constructor(
    code: ShopifyConnectorErrorCode,
    message: string,
    options: ShopifyConnectorErrorOptions = {},
  ) {
    super(message, options.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "ShopifyConnectorError";
    this.code = code;
    this.storeId = options.storeId;
    this.shopDomain = options.shopDomain;
  }
}

export function isShopifyConnectorError(error: unknown): error is ShopifyConnectorError {
  return error instanceof ShopifyConnectorError;
}
