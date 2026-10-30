import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Dashboard session auth for the human decision endpoints.
 *
 * The real login page arrives with the dashboard subtask; until then a single
 * passcode (DASHBOARD_PASSCODE env var) gates the queue. The session cookie
 * carries a token derived from the passcode (sha256 hex), never the passcode
 * itself, so the cookie value can appear in logs and test fixtures without
 * leaking the secret. Fail closed: with no passcode configured nothing is
 * ever authorized.
 */

export const DASHBOARD_SESSION_COOKIE = "iv_session";

/**
 * Identity recorded for passcode-era decisions (`human:<identity>` per spec).
 * The dashboard subtask can replace this with a real user name without a
 * schema change — decidedBy is a plain string.
 */
export const DASHBOARD_IDENTITY = "dashboard";

/**
 * Session token for a configured passcode. Returns undefined when no passcode
 * is set, which makes every request unauthorized.
 */
export function dashboardSessionToken(
  passcode: string | undefined,
): string | undefined {
  if (!passcode) return undefined;
  return createHash("sha256").update(passcode, "utf8").digest("hex");
}

/** Read one cookie's value from the request's Cookie header. */
export function readSessionCookie(
  request: Request,
  name: string,
): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const pair of header.split(";")) {
    const eq = pair.indexOf("=");
    if (eq === -1) continue;
    if (pair.slice(0, eq).trim() === name) {
      return pair.slice(eq + 1).trim();
    }
  }
  return null;
}

/**
 * Timing-safe session-token check. Length is compared before timingSafeEqual
 * because the latter throws on mismatched lengths; the token format (sha256
 * hex) is public knowledge, so an early length miss leaks nothing.
 */
export function isAuthorizedDashboardRequest(
  request: Request,
  expectedToken: string | undefined,
): boolean {
  if (!expectedToken) return false;
  const provided = readSessionCookie(request, DASHBOARD_SESSION_COOKIE);
  if (!provided) return false;
  const given = Buffer.from(provided, "utf8");
  const expected = Buffer.from(expectedToken, "utf8");
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** Audit actor for a human decision: the spec's `<kind>:<identity>` pattern. */
export function humanActor(identity: string): string {
  return `human:${identity}`;
}
