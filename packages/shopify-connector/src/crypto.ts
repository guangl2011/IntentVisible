/**
 * Cryptographic helpers for the two Shopify signature surfaces (OAuth
 * callback, webhook delivery) and the snapshot content hash. Kept free of
 * connector policy so each caller states its own digest format.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

/**
 * Length-guarded constant-time comparison for signature strings.
 * timingSafeEqual throws on unequal lengths, so the length check happens
 * first; unequal lengths are themselves a mismatch.
 */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  return left.length === right.length && timingSafeEqual(left, right);
}

/** Hex-encoded HMAC-SHA256 — the OAuth callback digest format. */
export function hmacSha256Hex(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

/** Base64-encoded HMAC-SHA256 — the webhook signature format. */
export function hmacSha256Base64(message: string, secret: string): string {
  return createHmac("sha256", secret).update(message).digest("base64");
}

/** SHA-256 hex digest — the content_hash recorded for each snapshot page. */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
