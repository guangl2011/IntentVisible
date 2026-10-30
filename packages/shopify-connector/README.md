# @intentvisible/shopify-connector

The single Shopify boundary for IntentVisible (spec art_Aj4HcWgx, section D1):
OAuth install + callback verification, Admin GraphQL catalog sync into
content-hashed snapshots, and webhook signature verification. No other
package talks to Shopify.

Every exported function takes an explicit per-store config
(`store_id`, `client_id`, `client_secret`, `shop_domain`) — no implicit
global store state, no ambient credentials.

## OAuth (authorization code grant)

- `buildInstallUrl(config, state?)` — the merchant-facing
  `https://{shop}/admin/oauth/authorize` URL. Scope is locked to
  `read_products,read_online_store_pages` and **cannot be widened by any
  caller** — the function takes no scope parameter. Returns the URL plus a
  single-use `state` nonce the caller must persist per install attempt.
- `verifyOAuthCallback(config, { query, expectedState })` — verification
  order follows the docs: state nonce first (missing/consumed nonce ⇒
  `state_mismatch`, which is how replays are rejected), then the callback
  HMAC (hex SHA-256 over the sorted `key=value` pairs, `hmac` excluded,
  constant-time compared ⇒ `hmac_rejected`), then the shop domain against
  the config, then code presence.
- `exchangeCodeForToken(config, code, deps?)` — exchanges the code for an
  **offline** access token (no expiry; the default grant). Transports are
  injectable (`postJson`), so tests never touch the network.

## Admin GraphQL catalog sync

`AdminGraphQLClient` posts `{ query, variables }` to
`https://{shop}/admin/api/{apiVersion}/graphql.json` with the
`X-Shopify-Access-Token` header, and classifies failures:
HTTP 401 → `token_expired` (re-authorization required), HTTP 429 →
`graphql_error` with the Retry-After value when present, GraphQL
`errors` arrays (returned with HTTP 200 per the GraphQL spec) →
`graphql_error` with the first message and extension code.

`syncCatalog(client, options)` runs the full pull:

1. `ShopResourceQuery` — shop name, description, currency, myshopify
   domain, primary domain. The response's `myshopifyDomain` must equal the
   configured store domain or the sync aborts (`graphql_error`).
2. `CatalogPageQuery` — cursor-paginated products (`first`/`after`,
   `sortKey: ID` for deterministic ordering) with variants inline
   (`first: $variantsFirst`); pages whose variants overflow are completed
   with `ProductVariantsPage` refetches and merged before mapping.
3. Every raw response body is kept verbatim as a `CatalogSnapshotPage`
   with a SHA-256 `content_hash` and a
   `shopify-catalog://{shopDomain}/{hash}.json` storage reference — the
   incremental-refresh key core-schema's SnapshotRef defines. The connector
   returns the pages; the API layer persists them.
4. Products map to core-schema `ProductProfile` (canonical PDP URL via
   onlineStoreUrl → preview URL → primary-domain fallback; SKU summaries
   per variant; product price = cheapest variant) and the shop resource to
   a `BrandProfile`. Both are validated with their Zod schemas — a record
   that fails validation throws with the schema issue paths.

Failure policy: store-level breakage (malformed shop resource, broken
connection shape, transport/auth failures) aborts the sync with a typed
error; a single unmappable product becomes a `failures` entry (product id
+ reason) while the rest of the catalog proceeds. Soft issues (variant
with an unparseable price) are recorded the same way. Products with more
than 500 variants exceed the core-schema SKU cap and surface as failures
(their raw snapshots remain available for audit).

## Webhooks

See `src/webhooks.ts` — HMAC verification of the raw body **before** any
JSON parsing for `app/uninstalled`, `products/update`, `products/delete`.

## Errors

All Shopify-boundary rejections throw `ShopifyConnectorError` with a `code`:

| Code | Meaning |
| --- | --- |
| `hmac_rejected` | Signature check failed (OAuth callback or webhook). |
| `state_mismatch` | OAuth state nonce missing, consumed (replay), or mismatched; callback shop mismatch. |
| `token_expired` | Admin API rejected the stored access token (HTTP 401). |
| `graphql_error` | Any other Admin GraphQL failure (transport, HTTP status, GraphQL errors array, unexpected response shape). |
| `oauth_failed` | The authorization-code exchange was rejected (bad/used code, non-JSON or incomplete response). |

Caller invariant violations (malformed config, impossible shapes) throw
plain `Error` — developer bugs, not wire rejections.

Error messages never contain the client secret or access token.

## Scope notes

`read_online_store_pages` is a real Shopify access scope (shopify.dev,
access scopes reference, verified 2026-10-30) covering online store /
page content; `read_products` covers the product catalog the Admin GraphQL
queries read. Nothing else is requested.

## Testing

Fixtures only: recorded Admin GraphQL payloads, computed HMACs. No network
in unit tests, no real store. Run:

```sh
pnpm --filter @intentvisible/shopify-connector test
pnpm --filter @intentvisible/shopify-connector typecheck
```
