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

See `src/admin-api.ts` and `src/catalog-sync.ts` (cursor-paginated product
sync producing core-schema `BrandProfile`/`ProductProfile` records with
SHA-256 snapshot references for every raw response page).

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
