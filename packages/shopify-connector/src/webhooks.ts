/**
 * Webhook signature verification (spec D1): HMAC-SHA256 over the raw
 * request body, base64-encoded, in the X-Shopify-Hmac-Sha256 header —
 * verified BEFORE any body processing (shopify.dev/webhooks — verified
 * 2026-10-30). The caller must pass the exact bytes it received; a body
 * that has been re-serialized, re-encoded, or trimmed will not verify.
 *
 * Verification and routing are separate concerns: `verifyWebhook` answers
 * only "was this delivery signed by the app's secret over these exact
 * bytes". Topic filtering is the caller's job, via
 * `isSupportedWebhookTopic`. Webhook deliveries carry no nonce, so replay
 * protection is delivery-level deduplication — the envelope surfaces the
 * `X-Shopify-Webhook-Id` header (unique per delivery per shop per topic
 * per API version, per the docs) for the API layer's dedup store.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { ShopifyConnectorError } from "./errors.js";

export const WEBHOOK_TOPICS = [
  "app/uninstalled",
  "products/update",
  "products/delete",
] as const;
export type WebhookTopic = (typeof WEBHOOK_TOPICS)[number];

export interface WebhookVerificationInput {
  /** The app's API secret key (the OAuth client secret). */
  readonly clientSecret: string;
  /** Delivery headers, any casing. */
  readonly headers: Record<string, string>;
  /**
   * The raw request body EXACTLY as received. The HMAC is computed over
   * these bytes; re-serialized bodies fail verification by design.
   */
  readonly rawBody: string | Buffer | Uint8Array;
}

export interface VerifiedWebhook {
  readonly topic: string;
  /** Store domain from X-Shopify-Shop-Domain (absent on malformed deliveries). */
  readonly shopDomain: string | undefined;
  /** Delivery id from X-Shopify-Webhook-Id, for caller-side deduplication. */
  readonly webhookId: string | undefined;
  /** The JSON payload — parsed only after the HMAC verified. */
  readonly payload: unknown;
}

const HMAC_HEADER = "x-shopify-hmac-sha256";
const SHOP_HEADER = "x-shopify-shop-domain";
const TOPIC_HEADER = "x-shopify-topic";
const WEBHOOK_ID_HEADER = "x-shopify-webhook-id";

/** Case-insensitive header lookup for callers that pass original casing. */
function headerValue(headers: Record<string, string>, lowerName: string): string | undefined {
  const direct = headers[lowerName];
  if (direct !== undefined) {
    return direct;
  }
  for (const [name, value] of Object.entries(headers)) {
    if (name.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
}

function toBytes(rawBody: string | Buffer | Uint8Array): Buffer {
  if (typeof rawBody === "string") {
    return Buffer.from(rawBody, "utf8");
  }
  return Buffer.from(rawBody);
}

/**
 * Verifies the delivery's HMAC and returns the envelope with the parsed
 * payload. Any failure — missing header, signature mismatch — throws
 * `hmac_rejected` before the body is parsed; a body that is not valid
 * JSON after a successful check surfaces the parse error (a verified
 * source sent malformed data).
 */
export function verifyWebhook(input: WebhookVerificationInput): VerifiedWebhook {
  const { clientSecret } = input;
  if (typeof clientSecret !== "string" || clientSecret === "") {
    throw new Error("webhook verification requires the app's client secret");
  }

  const provided = headerValue(input.headers, HMAC_HEADER);
  if (provided === undefined || provided.trim() === "") {
    throw new ShopifyConnectorError(
      "hmac_rejected",
      `webhook delivery carries no ${HMAC_HEADER} header — not a Shopify-signed delivery`,
    );
  }

  const digest = createHmac("sha256", clientSecret)
    .update(toBytes(input.rawBody))
    .digest("base64");
  const providedBytes = Buffer.from(provided.trim(), "base64");
  const digestBytes = Buffer.from(digest, "base64");
  const signatureValid =
    providedBytes.length === digestBytes.length && timingSafeEqual(providedBytes, digestBytes);
  if (!signatureValid) {
    throw new ShopifyConnectorError(
      "hmac_rejected",
      "webhook HMAC mismatch — the body or the signature was altered in transit",
    );
  }

  return {
    topic: headerValue(input.headers, TOPIC_HEADER) ?? "",
    shopDomain: headerValue(input.headers, SHOP_HEADER),
    webhookId: headerValue(input.headers, WEBHOOK_ID_HEADER),
    payload: JSON.parse(toBytes(input.rawBody).toString("utf8")) as unknown,
  };
}

export function isSupportedWebhookTopic(topic: string): topic is WebhookTopic {
  return (WEBHOOK_TOPICS as readonly string[]).includes(topic);
}
