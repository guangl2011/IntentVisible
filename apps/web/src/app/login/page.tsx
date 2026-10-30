import { signIn } from "./actions";

/**
 * Passcode login for the dashboard. Single-tenant by design (spec, open
 * questions): one passcode from DASHBOARD_PASSCODE gates every page below
 * the (dashboard) layout. Renders even when no passcode is configured, but
 * the server action always rejects — fail closed, no oracle for the config.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

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
