"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  DASHBOARD_SESSION_COOKIE,
  dashboardSessionToken,
  timingSafeSessionCompare,
} from "../../lib/dashboard-auth";

/**
 * Passcode login: hash the submitted passcode and compare timing-safely
 * against the token derived from DASHBOARD_PASSCODE, then set the session
 * cookie. The cookie carries the sha256 token, never the passcode. Fail
 * closed: with no passcode configured no submission ever succeeds.
 */
export async function signIn(formData: FormData): Promise<void> {
  const submitted = String(formData.get("passcode") ?? "");
  const expected = dashboardSessionToken(process.env.DASHBOARD_PASSCODE);
  const provided = dashboardSessionToken(submitted);

  if (!expected || !timingSafeSessionCompare(provided, expected)) {
    redirect("/login?error=invalid");
  }

  const store = await cookies();
  store.set(DASHBOARD_SESSION_COOKIE, expected, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  redirect("/queue");
}

/** Clear the session cookie and return to the login page. */
export async function signOut(): Promise<void> {
  const store = await cookies();
  store.delete(DASHBOARD_SESSION_COOKIE);
  redirect("/login");
}
