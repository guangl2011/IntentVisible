import { cookies } from "next/headers";
import { DASHBOARD_SESSION_COOKIE, dashboardSessionToken } from "../../lib/dashboard-auth";
import { signIn } from "./actions";

/**
 * Passcode login for the dashboard. Single-tenant by design (spec, open
 * questions): one passcode from DASHBOARD_PASSCODE gates every page below
 * the (dashboard) layout. Renders even when no passcode is configured, but
 * the server action always rejects — fail closed, no oracle for the config.
 *
 * After a successful sign-in the server action sets the session cookie and
 * returns (no redirect): reverse proxies that follow redirect responses can
 * drop the Set-Cookie header, which would leave the browser unauthenticated
 * on /queue. Instead the page renders this signed-in handoff (HTTP 200, so
 * Set-Cookie survives the proxy) and forwards to /queue via meta refresh.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const store = await cookies();
  const session = store.get(DASHBOARD_SESSION_COOKIE)?.value;
  const signedIn =
    Boolean(session) &&
    session === dashboardSessionToken(process.env.DASHBOARD_PASSCODE);

  if (signedIn) {
    return (
      <main className="auth-page">
        <div className="card auth-card">
          <h1>IntentVisible</h1>
          <p className="muted">Signed in. Taking you to the dashboard…</p>
          <meta httpEquiv="refresh" content="0;url=/queue" />
          <a href="/queue" className="button-like">
            Continue to the dashboard
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="auth-page">
      <form action={signIn} className="card auth-card">
        <h1>IntentVisible</h1>
        <p className="muted">Sign in to review agent intent.</p>
        {error === "invalid" ? (
          <p className="error" role="alert">
            Invalid passcode.
          </p>
        ) : null}
        <label htmlFor="passcode">Passcode</label>
        <input
          id="passcode"
          name="passcode"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
        <button type="submit">Sign in</button>
      </form>
    </main>
  );
}
