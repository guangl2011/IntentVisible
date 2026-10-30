/**
 * The locked least-privilege scope set (spec D1: read_products,
 * read_online_store_pages — "nothing else"). Least privilege is enforced
 * structurally: buildInstallUrl requests exactly this set and offers no
 * parameter that can widen it. After the token exchange, the granted set
 * can be checked against the same list.
 */

export const LEAST_PRIVILEGE_SCOPES = [
  "read_products",
  "read_online_store_pages",
] as const;

export type LeastPrivilegeScope = (typeof LEAST_PRIVILEGE_SCOPES)[number];

/**
 * Comma-separated scope parameter for the authorize URL. Shopify's OAuth
 * takes comma-separated scopes (shopify.dev, authorization code grant).
 */
export const LEAST_PRIVILEGE_SCOPE_PARAM = LEAST_PRIVILEGE_SCOPES.join(",");

/** Parses the token-exchange response's `scope` field (comma-separated) into a list. */
export function parseGrantedScopes(scopeParam: string): string[] {
  return scopeParam
    .split(",")
    .map((scope) => scope.trim())
    .filter((scope) => scope !== "");
}

/**
 * Granted scopes outside the least-privilege set — non-empty means the
 * install ended up with more access than this slice uses. Empty when the
 * granted set is exactly the locked one.
 */
export function leastPrivilegeViolations(granted: readonly string[]): string[] {
  const allowed = new Set<string>(LEAST_PRIVILEGE_SCOPES);
  return [...new Set(granted)].filter((scope) => !allowed.has(scope)).sort();
}

/** Locked scopes the store did not actually grant — non-empty means degraded capability. */
export function missingLeastPrivilegeScopes(granted: readonly string[]): LeastPrivilegeScope[] {
  const grantedSet = new Set(granted);
  return LEAST_PRIVILEGE_SCOPES.filter((scope) => !grantedSet.has(scope));
}
