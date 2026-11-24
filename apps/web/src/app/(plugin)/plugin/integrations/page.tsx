"use client";

import { useT } from "../../../../lib/plugin/i18n/locale";
import { BlindSpotFooter } from "../components/red-lines";

/**
 * Integrations — connection states (design v1.4 §2.6, Phase I state):
 * Shopify connected through the plugin's own install; the Nango and
 * treg.to cards are Phase II / pay-per-call stubs, shown as exactly that
 * — no fake OAuth, no fake connect buttons.
 */
export default function IntegrationsPage() {
  const t = useT();
  return (
    <>
      <h1>{t.integrations.title}</h1>
      <p className="muted">{t.integrations.intro}</p>
      <div className="card">
        <div className="intent-head">
          <h3>{t.integrations.shopify.title}</h3>
          <span className="badge badge-APPROVED">{t.integrations.shopify.connected}</span>
        </div>
        <p className="muted">{t.integrations.shopify.body}</p>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>{t.integrations.nango.title}</h3>
          <span className="badge badge-PENDING_APPROVAL">{t.integrations.nango.badge}</span>
        </div>
        <p className="muted">{t.integrations.nango.body}</p>
      </div>
      <div className="card">
        <div className="intent-head">
          <h3>{t.integrations.treg.title}</h3>
          <span className="badge badge-PENDING_APPROVAL">{t.integrations.treg.badge}</span>
        </div>
        <p className="muted">{t.integrations.treg.body}</p>
      </div>
      <BlindSpotFooter items={t.blindSpots.integrations} />
    </>
  );
}
