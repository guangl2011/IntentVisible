"use client";

import { BILLING_PLAN } from "../../../../lib/plugin/demo-fixtures";
import { useT } from "../../../../lib/plugin/i18n/locale";
import { usd } from "../components/badges";
import { BlindSpotFooter, SourceLabel } from "../components/red-lines";

/**
 * Billing (design v1.4 §2.6): the settings billing summary — Track A
 * commission rates and windows always visible, Track B shown as the
 * Phase II stub it is. Per-effect detail lives on the Commission page.
 */
export default function BillingPage() {
  const t = useT();
  return (
    <>
      <h1>{t.billing.title}</h1>
      <p className="muted">{t.billing.intro}</p>

      <div className="card" data-testid="billing-plan">
        <div className="intent-head">
          <h3>{t.billing.planTitle}</h3>
        </div>
        <p>
          <strong>{t.billing.planName}</strong> — {t.billing.planNote}
        </p>
        <p className="muted">{t.billing.planSummary}</p>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>{t.billing.trackA.title}</h3>
          <SourceLabel kind="measured" />
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>{t.billing.trackA.headers.band}</th>
              <th>{t.billing.trackA.headers.gross}</th>
              <th>{t.billing.trackA.headers.refunds}</th>
              <th>{t.billing.trackA.headers.net}</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                {t.billing.trackA.band(
                  (BILLING_PLAN.track_a_rate_band.min * 100).toFixed(0),
                  (BILLING_PLAN.track_a_rate_band.max * 100).toFixed(0),
                )}
              </td>
              <td>{usd(BILLING_PLAN.track_a_totals.gross)}</td>
              <td>{usd(BILLING_PLAN.track_a_totals.refunds)}</td>
              <td>{usd(BILLING_PLAN.track_a_totals.net)}</td>
            </tr>
          </tbody>
        </table>
        <p className="muted">{t.billing.trackA.basisNote}</p>
      </div>

      <div className="card">
        <div className="intent-head">
          <h3>{t.billing.trackB.title}</h3>
          <span className="badge badge-not-measured">{t.billing.trackB.badge}</span>
        </div>
        <p className="muted">{t.billing.trackB.body}</p>
      </div>

      <BlindSpotFooter items={t.blindSpots.billing} />
    </>
  );
}
