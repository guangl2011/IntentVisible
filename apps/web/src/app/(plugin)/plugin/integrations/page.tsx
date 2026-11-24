import { BlindSpotFooter } from "../components/red-lines";

/**
 * Integrations — connection states (design v1.4 §2.6, Phase I state):
 * Shopify connected through the plugin's own install; the Nango and
 * treg.to cards are Phase II / pay-per-call stubs, shown as exactly that
 * — no fake OAuth, no fake connect buttons.
 */
export default function IntegrationsPage() {
  return (
    <>
      <h1>Integrations</h1>
      <p className="muted">
        What IntentVisible is connected to, and what each connection is allowed to see. Private merchant
        data moves through authorized connectors only; public intelligence is a separate, paid-per-call
        channel.
      </p>
      <div className="card">
        <div className="intent-head">
          <h3>Shopify</h3>
          <span className="badge badge-APPROVED">connected</span>
        </div>
        <p className="muted">
          Your Shopify store connection supplies the order ledger — the system's measured anchor — plus the
          Web Pixel event stream. Scopes are read-only first; every permission is explained at install.
        </p>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>Nango — private analytics &amp; ads connections</h3>
          <span className="badge badge-PENDING_APPROVAL">Phase II stub</span>
        </div>
        <p className="muted">
          GA4, Meta, Google, and TikTok Ads authorizations will route through Nango (nango.proxy()): your
          private merchant data and any authorized actions flow there, encrypted and tenant-scoped. Not
          connectable yet — no live OAuth in Phase I.
        </p>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>treg.to — public market intelligence</h3>
          <span className="badge badge-PENDING_APPROVAL">developer key · pay-per-call</span>
        </div>
        <p className="muted">
          Public market intelligence calls are billed per call on our developer key — you pay nothing for
          them and no private data of yours ever routes through treg.to. Not enabled in Phase I.
        </p>
      </div>
      <BlindSpotFooter
        items={[
          "Connection states reflect Phase I only — the Nango and treg.to cards activate in Phase II.",
          "Scope lists show what each connection can read; nothing is read beyond the install-scoped permissions.",
        ]}
      />
    </>
  );
}
