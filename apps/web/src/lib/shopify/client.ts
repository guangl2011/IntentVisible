import { createShopifyClient } from "@intentvisible/client";

/**
 * The merchant pages' only data path: the typed Shopify merchant client
 * pointed at the Shopify API surfaces. In dev the Next.js rewrite proxies
 * /shopify-api/* to the API server; in production the base URL comes from
 * the environment. No Prisma, no direct DB access — spec D4's hard
 * constraint for the new pages.
 */
export function getShopifyClient() {
  return createShopifyClient({
    baseUrl: process.env.NEXT_PUBLIC_SHOPIFY_API_BASE ?? "/shopify-api",
  });
}
