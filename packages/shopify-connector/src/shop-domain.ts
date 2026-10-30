/**
 * Shop-domain handling. The `{slug}.myshopify.com` domain is the store's
 * stable identity across OAuth (shop parameter), the Admin API
 * (shop.myshopifyDomain), and webhooks (X-Shopify-Shop-Domain).
 */

const MYSHOPIFY_DOMAIN_PATTERN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function isMyShopifyDomain(domain: string): boolean {
  return MYSHOPIFY_DOMAIN_PATTERN.test(domain);
}

/**
 * Throws on a shop value that cannot be a myshopify domain. Used on
 * caller-supplied config (fail fast on developer bugs, before any wire
 * call) — wire-delivered shop values are validated with isMyShopifyDomain
 * and typed errors instead.
 */
export function assertMyShopifyDomain(domain: string): void {
  if (!isMyShopifyDomain(domain)) {
    throw new Error(`shop domain must match {slug}.myshopify.com (lowercase), got "${domain}"`);
  }
}
