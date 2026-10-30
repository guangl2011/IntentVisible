import { cookies } from "next/headers";
import {
  DASHBOARD_SESSION_COOKIE,
  dashboardSessionToken,
  timingSafeSessionCompare,
} from "./dashboard-auth";

/**
 * Server-side session check for dashboard pages and server actions.
 *
 * Reads the session cookie via next/headers and compares it timing-safely
 * against the token derived from DASHBOARD_PASSCODE. Fail closed: with no
 * passcode configured nothing is ever authorized.
 */
export async function hasDashboardSession(): Promise<boolean> {
  const expected = dashboardSessionToken(process.env.DASHBOARD_PASSCODE);
  const store = await cookies();
  return timingSafeSessionCompare(
    store.get(DASHBOARD_SESSION_COOKIE)?.value,
    expected,
  );
}
