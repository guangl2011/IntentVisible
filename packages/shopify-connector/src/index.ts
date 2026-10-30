/**
 * @intentvisible/shopify-connector — the Shopify boundary (spec D1).
 *
 * OAuth install/callback verification, Admin GraphQL catalog sync, and
 * webhook signature verification. Every operation is scoped by an explicit
 * store config; network transports are injectable so tests run on fixtures
 * only. The typed error surface lives in ./errors.js.
 */

export * from "./errors.js";
export * from "./scopes.js";
export * from "./shop-domain.js";
export * from "./crypto.js";
export * from "./oauth.js";
export * from "./admin-api.js";
export * from "./catalog-sync.js";
